"""Peak private memory of Chrome on /remove-background/ (Sprint C, C2; Arch ruling 6). Local only (Windows owner PC),
not CI. Needs Python with `playwright` and `psutil`, Google Chrome, and a flag-on build served by tests/e2e/serve.mjs:

    PUBLIC_BG_REMOVE=1 npm run build && mv dist dist-bg
    PORT=4182 DIST=dist-bg node tests/e2e/serve.mjs &
    python scripts/regress/bgremove-mem.py --engine webgpu|wasm [--photo <jpg>] [--photos 5] [--port 4182]

The page is driven like a user: pick the photo, 받고 시작, wait for the result, then the same photo again, N times in
all (the engine stays alive between photos: Arch round 2). Every 100 ms the private bytes of all Chrome processes of a
fresh profile are summed (the C2.0 probe's method). Per photo: the peak during that photo, the time from the pick to
the edge-colour step ("가장자리를 정리하는 중이에요", i.e. without fusion) and to the result. Printed as JSON. Default photo: a 12 MP (4,000×3,000)
JPEG made from tests/fixtures/bgremove/cc0-dog.jpg, the "tab not killed on a 12 MP photo" case of the brief.
The first photo includes the download (from the local server) and the session start.
"""
import argparse, json, os, shutil, tempfile, threading, time

import psutil
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def chrome_procs(profile):
    out = []
    for p in psutil.process_iter(['name', 'cmdline']):
        try:
            if p.info['name'] and 'chrome' in p.info['name'].lower() and any(profile in (c or '') for c in (p.info['cmdline'] or [])):
                out.append(p)
        except Exception:
            pass
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--engine', choices=['webgpu', 'wasm'], default='webgpu')
    ap.add_argument('--photo')
    ap.add_argument('--port', type=int, default=4182)
    ap.add_argument('--photos', type=int, default=5)
    a = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix='bgmem-')
    photo = a.photo
    if not photo:
        photo = os.path.join(tmp, 'photo-12mp.jpg')
        Image.open(os.path.join(ROOT, 'tests', 'fixtures', 'bgremove', 'cc0-dog.jpg')).resize((4000, 3000), Image.LANCZOS).save(photo, quality=90)
    profile = os.path.join(tmp, 'profile')
    peak = {'total': 0, 'by': {}}
    window = {'peak': 0}
    stop = [False]

    def sample():
        while not stop[0]:
            tot, by = 0, {}
            for p in chrome_procs(profile):
                try:
                    v = p.memory_info().private
                    tot += v
                    t = next((c.split('=')[1] for c in p.cmdline() if c.startswith('--type=')), 'browser')
                    by[t] = by.get(t, 0) + v
                except Exception:
                    pass
            if tot > peak['total']:
                peak['total'], peak['by'] = tot, by
            window['peak'] = max(window['peak'], tot)
            time.sleep(0.1)

    th = threading.Thread(target=sample)
    th.start()
    R = {'engine': a.engine, 'photo': os.path.basename(photo), 'size': Image.open(photo).size}
    try:
        with sync_playwright() as pw:
            args = ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--ignore-gpu-blocklist'] if a.engine == 'webgpu' else []
            ctx = pw.chromium.launch_persistent_context(profile, channel='chrome', headless=True, args=args)
            page = ctx.new_page()
            if a.engine == 'wasm':
                page.add_init_script('Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true })')
            page.goto(f'http://127.0.0.1:{a.port}/remove-background/')
            page.wait_for_load_state('load')
            time.sleep(1)
            R['idle_mb'] = round(sum(p.memory_info().private for p in chrome_procs(profile)) / 2**20)
            R['photos'] = []
            for n in range(a.photos):
                window['peak'] = 0
                # The progress line still says the previous photo's last step: clear it so the wait below is for this one.
                page.evaluate("document.getElementById('bg-progress-text').textContent = ''")
                t0 = time.time()
                page.set_input_files('#bg-input', photo)
                if n == 0:
                    page.wait_for_selector('#bg-start', state='visible', timeout=60000)
                    page.click('#bg-start')
                # Polled from here: wait_for_function would evaluate a string, which the page's CSP refuses.
                end = time.time() + 600
                while '가장자리' not in (page.locator('#bg-progress-text').text_content() or '') and not page.locator('#bg-error').is_visible():
                    if time.time() > end:
                        raise TimeoutError('no edge-colour step')
                    time.sleep(0.02)
                t1 = time.time()
                engine_peak = window['peak']
                window['peak'] = 0
                page.wait_for_selector('#bg-result:not([hidden]), #bg-error:not([hidden])', timeout=600000)
                t2 = time.time()
                R['photos'].append(dict(state=page.get_attribute('#bg-tool', 'data-state'), to_fusion_s=round(t1 - t0, 2), total_s=round(t2 - t0, 2),
                                    peak_mb=round(max(engine_peak, window['peak']) / 2**20), peak_to_fusion_mb=round(engine_peak / 2**20), peak_fusion_mb=round(window['peak'] / 2**20)))
                page.click('#bg-new')
            ctx.close()
    finally:
        stop[0] = True
        th.join()
        shutil.rmtree(tmp, ignore_errors=True)
    R['peak_private_mb'] = round(peak['total'] / 2**20)
    R['peak_by_type_mb'] = {k: round(v / 2**20) for k, v in peak['by'].items()}
    print(json.dumps(R))


if __name__ == '__main__':
    main()
