// Growth G.1, G.6, G.8 (T4, T5, T6 constants): the guide frontmatter contract, the fact check, the quick links.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { guideProblems, guideSchema, publishedGuideSchema, MAX_SOURCE_AGE_DAYS } from '../../src/data/guide-schema';
import { allowedFacts, numberUnits, resolveSources, unsourcedFacts } from '../../src/data/guide-facts';
import { GMAIL_LIMIT, fitKb, presetLimit, quickLinks } from '../../src/data/quicklinks';
import { PRESETS, getPreset } from '../../src/data/id-photo-presets';
import { TOOL_FACTS } from '../../src/data/tool-facts';
import { parse as parseDeep } from '../../src/lib/ui/deeplink';
import { CF_MAX_FILES, MAX_FILE, MAX_FILES, WARN_FILES } from '../../scripts/lib/capacity.mjs';
import { TOPICS } from '../../src/data/guide-schema';
import { specProblems } from '../../src/data/guide-facts';
import { hubSchema } from '../../src/data/hub-schema';
import { HUB_KIND, HUB_SLUGS, hubRows } from '../../src/data/hubs';
import { ID_PHOTO_LINK_MAX, ID_PHOTO_LINK_ORDER } from '../../src/data/quicklinks';
import { GUARD_PAGES, LIMITS as HWP_LIMITS, MB_DEC } from '../../src/lib/hwp/limits';

const DIR = join(__dirname, '..', '..', 'src', 'content', 'guides');
const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
const read = (f: string) => {
  const raw = readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw)!;
  return { slug: f.replace(/\.md$/, ''), data: parseYaml(m[1]!) as Record<string, unknown>, body: m[2]!, raw };
};
const guides = files.map(read);
const published = guides.filter((g) => g.data.draft !== true).map((g) => ({ ...g, parsed: publishedGuideSchema.parse(g.data) }));

describe('guides: schema (T4)', () => {
  it('every guide parses; at least 11 are published', () => {
    for (const g of guides) {
      const r = guideSchema.safeParse(g.data);
      expect(r.success, `${g.slug}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
    }
    expect(published.length).toBeGreaterThanOrEqual(11);
  });

  it('every related guide exists and is not the page itself; related, tool and preset refs resolve', () => {
    const slugs = new Set(guides.map((g) => g.slug));
    for (const g of published) {
      for (const r of g.parsed.related) {
        expect(slugs.has(r), `${g.slug} → ${r}`).toBe(true);
        expect(r).not.toBe(g.slug);
      }
      for (const s of g.parsed.sources) if ('preset' in s) expect(getPreset(s.preset), s.preset).toBeDefined();
      expect(guideProblems(g.parsed)).toEqual([]);
    }
  });

  it('every CTA opens a live tool with a valid deep link (or none)', () => {
    for (const g of published) {
      const u = new URL(g.parsed.cta.href, 'https://docttak.com');
      const slug = u.pathname.split('/')[1]!;
      if (u.search) expect(parseDeep(slug, u.searchParams), g.slug).not.toBeNull();
    }
  });

  it('dates: updated ≥ published, never in the future; a year in the title equals the year of updated', () => {
    const base = publishedGuideSchema.parse(published.find((g) => g.slug === 'driver-license-photo')!.data);
    const now = new Date('2026-09-30T12:00:00Z');
    expect(guideProblems({ ...base, published: '2026-09-30', updated: '2026-09-29' }, now).join()).toContain('before published');
    expect(guideProblems({ ...base, published: '2026-09-30', updated: '2026-10-01' }, now).join()).toContain('in the future');
    expect(guideProblems({ ...base, title: '운전면허 사진 규격 2025', updated: '2026-09-30' }, now).join()).toContain('title says 2025');
    expect(guideProblems({ ...base, title: '운전면허 사진 규격 2026', updated: '2026-09-30' }, now)).toEqual([]);
    expect(guideProblems({ ...base, answer: '두 문장이에요. 둘째 문장이에요.' }, now).join()).toContain('one sentence');
    expect(guideProblems({ ...base, answer: '다로 끝나지 않음' }, now).join()).toContain('다 or 요');
  });

  it('bad refs fail: unknown tool, unknown preset, wrong toolFact value, a CTA with an invalid param', () => {
    const base = publishedGuideSchema.parse(published.find((g) => g.slug === 'driver-license-photo')!.data);
    expect(guideProblems({ ...base, tools: ['heic-to-jpg'] }).join()).toContain('not a live tool');
    expect(guideProblems({ ...base, sources: [{ preset: 'nope' }] }).join()).toContain('does not exist');
    expect(guideProblems({ ...base, toolFacts: [{ ref: 'pdf-merge.maxFiles', value: 60 }] }).join()).toContain('is 50');
    expect(guideProblems({ ...base, toolFacts: [{ ref: 'made.up', value: 1 }] }).join()).toContain('not in src/data/tool-facts.ts');
    expect(guideProblems({ ...base, cta: { href: '/photo-compress/?target=99999', label: 'x' } }).join()).toContain('cta href');
    expect(guideProblems({ ...base, sources: [{ preset: 'half_card' }] }).join()).toContain('official page');
  });

  it('drafts record why they wait; the planned hard dates are kept', () => {
    const drafts = guides.filter((g) => g.data.draft === true);
    for (const d of drafts) expect(String(d.data.blockedBy).length).toBeGreaterThan(3);
    const by = Object.fromEntries(drafts.map((d) => [d.slug, d.data.publishBy]));
    if ('admission-photo' in by) expect(by['admission-photo']).toBe('2026-11-10');
    if ('yearend-tax-pdf' in by) expect(by['yearend-tax-pdf']).toBe('2026-11-30');
  });

  it('sources are https, dated, and at most 400 days old', () => {
    const now = Date.now();
    for (const g of published) {
      for (const s of resolveSources(g.parsed.sources)) {
        expect(s.url).toMatch(/^https:\/\//);
        expect((now - Date.parse(`${s.retrieved}T00:00:00Z`)) / 86_400_000, `${g.slug}: ${s.url}`).toBeLessThanOrEqual(MAX_SOURCE_AGE_DAYS);
      }
    }
  });
});

describe('guides: fact check (T9, source side)', () => {
  it('numberUnits reads chains, ranges and quote spellings', () => {
    expect(numberUnits('413×531픽셀')).toEqual(['413 픽셀', '531 픽셀']);
    expect(numberUnits('3.5cm x 4.5cm(137 x 177 pixel)')).toEqual(['3.5 cm', '4.5 cm', '137 픽셀', '177 픽셀']);
    expect(numberUnits('3.2~3.6cm, 10–20,000 KB, 25MB, 6개월')).toEqual(['3.2 cm', '3.6 cm', '10 KB', '20000 KB', '25 MB', '6 개월']);
    expect(numberUnits('2026-09-30, 50장, 1,500쪽')).toEqual([]);
  });

  it('every published guide passes: no number with a unit without a source', () => {
    for (const g of published) {
      const d = g.parsed;
      const text = [d.title, d.description, d.ogDescription, d.answer, d.og.title, d.og.line, d.cta.label, g.body, ...d.faq.flatMap((f) => [f.q, f.a])].join('\n');
      expect(unsourcedFacts(d, text), g.slug).toEqual([]);
    }
  });

  it('a typed number that no source backs fails', () => {
    const d = published.find((g) => g.slug === 'passport-photo')!.parsed;
    expect(unsourcedFacts(d, '여권사진은 400 KB 이하예요.')).toEqual(['400 KB']);
    expect(unsourcedFacts(d, '가로 3.4 cm')).toEqual(['3.4 cm']);
    expect(unsourcedFacts(d, '413×531픽셀, 500 KB 이하, 6개월')).toEqual([]);
  });

  it('presets and tool facts back their own numbers', () => {
    const facts = allowedFacts({ sources: [{ preset: 'gosi' }], toolFacts: [{ ref: 'pdf-merge.maxTotalMb.desktop', value: 500 }] });
    for (const f of ['137 픽셀', '177 픽셀', '350 KB', '3.5 cm', '4.5 cm', '500 MB']) expect(facts.has(f), f).toBe(true);
    expect(TOOL_FACTS['pdf-merge.maxFiles'].value).toBe(50);
  });
});

describe('quick links (T5)', () => {
  it('photo-compress values are floor(limitBytes / 1000) of the presets; the labels match their sources', () => {
    const links = quickLinks('photo-compress');
    const ids = ['qnet', 'gosi', 'passport_online'];
    expect(links.map((l) => l.href)).toEqual(ids.map((id) => `/photo-compress/?target=${Math.floor(getPreset(id)!.limitBytes! / 1000)}`));
    expect(links.map((l) => l.href)).toEqual(['/photo-compress/?target=200', '/photo-compress/?target=349', '/photo-compress/?target=500']);
    ids.forEach((id, i) => {
      const p = getPreset(id)!;
      const lim = presetLimit(p)!;
      expect(links[i]!.label).toContain(`${lim.kb}KB ${lim.rule}`);
      expect(p.quote!.replace(/\s/g, '')).toContain(`${lim.kb}KB${lim.rule}`);
      expect(fitKb(p) * 1000).toBeLessThanOrEqual(p.limitBytes!);
    });
  });

  it('id-photo: one link per preset (never custom); pdf-compress: the Gmail limit from its quote', () => {
    expect(quickLinks('id-photo').map((l) => l.href)).toEqual(PRESETS.map((p) => `/id-photo/?preset=${p.id}`));
    expect(GMAIL_LIMIT.quote).toContain(`${GMAIL_LIMIT.mb}MB`);
    expect(quickLinks('pdf-compress').map((l) => l.href)).toEqual(['/pdf-compress/?target=25', '/pdf-compress/?target=10', '/pdf-compress/?target=5']);
    for (const slug of ['id-photo', 'photo-compress', 'pdf-compress']) for (const l of quickLinks(slug)) expect(parseDeep(slug, new URL(l.href, 'https://x').searchParams), l.href).not.toBeNull();
    const guide = published.find((g) => g.slug === 'email-attachment-limit')!;
    expect(guide.parsed.sources.some((s) => 'quote' in s && s.quote === GMAIL_LIMIT.quote && s.url === GMAIL_LIMIT.url)).toBe(true);
  });
});

describe('G2 A1: topics, spec rows, hubs', () => {
  const HUB_DIR = join(__dirname, '..', '..', 'src', 'content', 'hubs');
  const hubFiles = HUB_SLUGS.map((slug) => {
    const raw = readFileSync(join(HUB_DIR, `${slug}.md`), 'utf8').replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw)!;
    return { slug, data: hubSchema.parse(parseYaml(m[1]!)), body: m[2]! };
  });
  const hubGuides = published.map((g) => ({ id: g.slug, data: g.parsed }));

  it('every published guide has a topic; every topic group the index shows is non-empty and lists each guide once', () => {
    for (const g of published) expect(TOPICS, g.slug).toContain(g.parsed.topic);
    const shown = TOPICS.map((t) => published.filter((g) => g.parsed.topic === t)).filter((x) => x.length);
    expect(shown.flat().length).toBe(published.length);
    expect(publishedGuideSchema.safeParse({ ...published[0]!.data, topic: undefined }).success).toBe(false);
    expect(publishedGuideSchema.safeParse({ ...published[0]!.data, topic: '기타' }).success).toBe(false);
  });

  it('spec rows pass the fact check; a literal number without a quote, an uncited preset or a preset row with literals fails', () => {
    for (const g of published) expect(specProblems(g.parsed), g.slug).toEqual([]);
    const email = published.find((g) => g.slug === 'email-attachment-limit')!.parsed;
    expect(specProblems({ ...email, spec: [{ label: 'Gmail', kind: 'upload', mb: 20 }] }).join()).toContain('20 MB has no source');
    expect(specProblems({ ...email, spec: [{ label: 'Q-Net', kind: 'photo', preset: 'qnet' }] }).join()).toContain('not a source of this guide');
    const qnet = published.find((g) => g.slug === 'qnet-photo')!.parsed;
    expect(specProblems({ ...qnet, spec: [{ label: 'Q-Net', kind: 'photo', preset: 'qnet', kb: 200 }] }).join()).toContain('takes its numbers from the preset');
    expect(specProblems({ ...qnet, spec: [{ label: 'Q-Net', kind: 'photo', preset: 'half_card' }] }).join()).toContain('not an official preset');
    expect(specProblems({ ...qnet, spec: [{ label: 'Q-Net', kind: 'photo' }] }).join()).toContain('states nothing');
    const dl = published.find((g) => g.slug === 'driver-license-photo')!.parsed;
    expect(specProblems({ ...dl, spec: [{ label: '면허', kind: 'photo', mm: { w: 30, h: 40 } }] }).join()).toContain('has no source');
  });

  it('hub numbers are the preset and guide values; a preset size shows only when its own quote states it', () => {
    const photo = hubRows(hubGuides, 'photo');
    const row = (label: string) => photo.find((r) => r.label.startsWith(label))!;
    const p = (id: string) => getPreset(id)!;
    expect(row('여권 사진').size).toBe(`${p('passport_online').outW}×${p('passport_online').outH} 픽셀`);
    expect(row('여권 사진').limit).toBe(`${presetLimit(p('passport_online'))!.kb} KB 이하`);
    expect(row('국가공무원').size).toBe(`${p('gosi').mm!.w / 10}×${p('gosi').mm!.h / 10} cm · ${p('gosi').outW}×${p('gosi').outH} 픽셀`);
    expect(row('국가공무원').limit).toBe(`${presetLimit(p('gosi'))!.kb} KB 미만`);
    expect(row('Q-Net').size).toBe(''); // Q-Net states no pixel size: our 413×531 choice is never shown as theirs.
    expect(row('Q-Net').fit).toBe('/id-photo/?preset=qnet');
    expect(row('사람인').limit).toBe(`${presetLimit(p('saramin'))!.kb / 1000} MB 이하`);
    const dl = published.find((g) => g.slug === 'driver-license-photo')!.parsed.spec[0]!;
    expect(row('운전면허').size).toBe(`${dl.mm!.w / 10}×${dl.mm!.h / 10} cm`);
    const upload = hubRows(hubGuides, 'upload');
    const kosaf = published.find((g) => g.slug === 'kosaf-docs')!.parsed.spec[0]!;
    expect(upload.find((r) => r.guide.slug === 'kosaf-docs')).toMatchObject({ limit: `${kosaf.kb} KB 이하`, fit: '' });
    expect(upload.find((r) => r.label.startsWith('Gmail'))!.limit).toBe(`${GMAIL_LIMIT.mb} MB 이하`);
    // Every number a row shows is backed by its guide (preset values or quotes).
    for (const r of [...photo, ...upload]) {
      const g = published.find((x) => x.slug === r.guide.slug)!.parsed;
      expect(unsourcedFacts(g, `${r.size} ${r.limit}`), r.label).toEqual([]);
    }
  });

  it('hubs: the copy passes the fact check against the tables; every spec guide has a row; slugs never clash with a guide', () => {
    for (const h of hubFiles) {
      const rows = h.data.tables.flatMap((t) => hubRows(hubGuides, t.kind).filter((r) => !t.limitOnly || r.limit));
      const allowed = new Set(rows.flatMap((r) => r.facts));
      const copy = [h.data.title, h.data.description, h.data.answer, h.body, ...h.data.faq.flatMap((f) => [f.q, f.a])].join('\n');
      expect(numberUnits(copy).filter((f) => !allowed.has(f)), h.slug).toEqual([]);
      const linked = new Set(rows.map((r) => r.guide.slug));
      for (const g of published.filter((x) => x.parsed.spec.some((r) => r.kind === HUB_KIND[h.slug]))) expect(linked.has(g.slug), `${h.slug} → ${g.slug}`).toBe(true);
      for (const r of h.data.related) expect(published.some((g) => g.slug === r), r).toBe(true);
      expect(guides.some((g) => g.slug === h.slug)).toBe(false);
    }
  });

  it('the new HWP tool facts are read from LIMITS', () => {
    expect(TOOL_FACTS['hwp.pdfMb.desktop'].value).toBe(HWP_LIMITS.desktop.capBytes / MB_DEC);
    expect(TOOL_FACTS['hwp.pdfPages.desktop'].value).toBe(HWP_LIMITS.desktop.capPages);
    expect(TOOL_FACTS['hwp-viewer.searchPages'].value).toBe(GUARD_PAGES);
  });

  it('/id-photo/ quick links: at most 8, the brief order first (skipping presets that did not ship), then the rest', () => {
    const ids = quickLinks('id-photo').map((l) => new URL(l.href, 'https://x').searchParams.get('preset'));
    expect(ids.length).toBeLessThanOrEqual(ID_PHOTO_LINK_MAX);
    const shipped = ID_PHOTO_LINK_ORDER.filter((id) => getPreset(id));
    expect(ids.slice(0, shipped.length)).toEqual(shipped);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('capacity guard (T6)', () => {
  it('check-dist fails at 15,000 files and 24 MiB per file and warns above 10,000; Cloudflare allows 20,000', () => {
    expect(MAX_FILES).toBe(15_000);
    expect(MAX_FILE).toBe(24 * 1024 * 1024);
    expect(WARN_FILES).toBe(10_000);
    expect(CF_MAX_FILES).toBe(20_000);
  });
});
