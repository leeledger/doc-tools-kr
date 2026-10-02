"""Peak private memory of Chrome on /remove-background/ (Sprint C, C2; Arch ruling 6). Local only (Windows owner PC),
not CI. Needs Python with `playwright` and `psutil`, Google Chrome, and a flag-on build served by tests/e2e/serve.mjs:

    PUBLIC_BG_REMOVE=1 npm run build && mv dist dist-bg
    PORT=4182 DIST=dist-bg node tests/e2e/serve.mjs &
    python scripts/regress/bgremove-mem.py --engine webgpu|wasm [--photo <jpg>] [--port 4182]

The page is driven like a user: pick the photo, 받고 시작, wait for the result, then a second photo (from the cache).
Every 100 ms the private bytes of all Chrome processes of a fresh profile are summed (the C2.0 probe's method);
the peak, the peak by process type, and the wall times are printed as JSON. Default photo: a 12 MP (4,000×3,000)
JPEG made from tests/fixtures/bgremove/cc0-dog.jpg, the "tab not killed on a 12 MP photo" case of the brief.
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
    a = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix='bgmem-')
    photo = a.photo
    if not photo:
        photo = os.path.join(tmp, 'photo-12mp.jpg')
        Image.open(os.path.join(ROOT, 'tests', 'fixtures', 'bgremove', 'cc0-dog.jpg')).resize((4000, 3000), Image.LANCZOS).save(photo, quality=90)
    profile = os.path.join(tmp, 'profile')
    peak = {'total': 0, 'by': {}}
    marks = []
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
            for run in ('first', 'cached'):
                t0 = time.time()
                page.set_input_files('#bg-input', photo)
                if run == 'first':
                    page.wait_for_selector('#bg-start', state='visible', timeout=60000)
                    page.click('#bg-start')
                page.wait_for_selector('#bg-result:not([hidden]), #bg-error:not([hidden])', timeout=600000)
                R[f'{run}_s'] = round(time.time() - t0, 1)
                R[f'{run}_state'] = page.get_attribute('#bg-tool', 'data-state')
                marks.append((run, round(peak['total'] / 2**20)))
                page.click('#bg-new')
            ctx.close()
    finally:
        stop[0] = True
        th.join()
        shutil.rmtree(tmp, ignore_errors=True)
    R['peak_private_mb'] = round(peak['total'] / 2**20)
    R['peak_by_type_mb'] = {k: round(v / 2**20) for k, v in peak['by'].items()}
    R['peak_after'] = dict(marks)
    print(json.dumps(R))


if __name__ == '__main__':
    main()
