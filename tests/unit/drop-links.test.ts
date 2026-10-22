import { describe, expect, it } from 'vitest';
// Sätteri is the Markdown engine Astro itself pins (astro -> @astrojs/markdown-satteri -> satteri); the test runs the
// real hast pass the build runs with PUBLIC_ID_CAMERA off.
import { markdownToHtml } from 'satteri';
import { dropLinksPlugin } from '../../scripts/lib/drop-links.mjs';
import { idCameraHiddenPaths } from '../../scripts/lib/idcamera.mjs';

const MD = [
  '## 직접 찍을 때',
  '',
  '- 남는 항목',
  '- **둘**: [촬영](/id-photo-camera/?preset=saramin) 링크',
  '',
  '앞 [안내](/guide/self-id-photo/) 문장과 [촬영](/id-photo-camera/) 하나 더.',
  '',
  '남는 [규격 맞추기](/id-photo/) 문장.',
  '',
].join('\n');

const html = async (paths: string[]) => {
  const r = (await markdownToHtml(MD, { hastPlugins: paths.length ? [dropLinksPlugin(paths)] : [] })) as unknown;
  return typeof r === 'string' ? r : (r as { html: string }).html;
};

describe('drop-links (IDCAM1022 E)', () => {
  it('flag off: every p/li linking the camera page or its guide is gone, the rest stays', async () => {
    const out = await html(idCameraHiddenPaths(false));
    expect(out).not.toContain('id-photo-camera');
    expect(out).not.toContain('self-id-photo');
    expect(out).not.toContain('하나 더');
    expect(out).toContain('<h2');
    expect(out).toContain('<li>남는 항목</li>');
    expect(out).toContain('<a href="/id-photo/">규격 맞추기</a>');
  });

  it('flag on: nothing to hide, the output is unchanged', async () => {
    expect(idCameraHiddenPaths(true)).toEqual([]);
    const out = await html(idCameraHiddenPaths(true));
    expect(out).toContain('/guide/self-id-photo/');
    expect(out).toContain('/id-photo-camera/?preset=saramin');
    expect(idCameraHiddenPaths(false)).toEqual(['/id-photo-camera/', '/guide/self-id-photo/']);
  });
});
