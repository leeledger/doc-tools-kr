// 증명사진 촬영 flag (IDCAM1022 D9-D10, brief handoff/ARCHITECT-BRIEF-IDCAM1022.md): PUBLIC_ID_CAMERA, DEFAULT "1".
// With "0" nothing about /id-photo-camera/ ships: no page, no tools-list entry, no menu or home card, no sitemap,
// llms.txt or share-image line, no 「카메라로 찍기」 link on /id-photo/ and no camera _headers block (check-dist).
// With "1" the page opens the camera with getUserMedia (nothing is sent anywhere) and hands the still to /id-photo/
// through the 이어서 하기 store. Its route is the only one whose Permissions-Policy allows the camera (camera=(self));
// every other path keeps the site-wide camera=() (the block below detaches the site-wide header, as the embed CSP does).

export const DEFAULT = '1';

/** True only for "1" (after trimming); an unset value takes DEFAULT. */
export function idCameraFlag(value) {
  const v = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT;
  return v === '1';
}

/** The page ships. `env`: the PUBLIC_* values. */
export function idCameraOn(env) {
  return idCameraFlag(env.PUBLIC_ID_CAMERA);
}

/** The path of the camera page. */
export const ID_CAMERA_PATH = '/id-photo-camera/';
/** The site-wide policy (public/_headers `/*`). */
export const SITE_POLICY = 'camera=(), microphone=(), geolocation=()';
/** The camera page's policy: its own origin may use the camera; microphone and location stay off. */
export const CAMERA_POLICY = 'camera=(self), microphone=(), geolocation=()';

/** The _headers block gen-headers appends when the flag is on ('' when off). */
export function cameraHeaders(on) {
  return on ? `${ID_CAMERA_PATH}*\n  ! Permissions-Policy\n  Permissions-Policy: ${CAMERA_POLICY}\n` : '';
}

/** Path rules of a _headers text (host rules skipped), in file order: [{ pattern, headers, detach }]. */
function parseRules(text) {
  const rules = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      current = pattern.startsWith('/') ? { pattern, headers: {}, detach: [] } : null;
      if (current) rules.push(current);
      continue;
    }
    if (!current) continue;
    const t = line.trim();
    if (t.startsWith('! ')) current.detach.push(t.slice(2).trim());
    else {
      const i = t.indexOf(':');
      if (i > 0) current.headers[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  return rules;
}

/** The Permissions-Policy Cloudflare would send for `path` (rules in order, a repeat joined with ", ", a detach drops it). */
export function policyFor(text, path) {
  let value;
  for (const r of parseRules(text)) {
    const hit = r.pattern.endsWith('*') ? path.startsWith(r.pattern.slice(0, -1)) : path === r.pattern;
    if (!hit) continue;
    if (r.detach.includes('Permissions-Policy')) value = undefined;
    const v = r.headers['Permissions-Policy'];
    if (v !== undefined) value = value === undefined ? v : `${value}, ${v}`;
  }
  return value;
}

/** Paths the check looks at besides the camera page: each must keep the site-wide policy. */
export const OTHER_PATHS = ['/', '/id-photo/', '/embed/id-photo/', '/remove-background/', '/id-photo-camera-x/', '/guide/passport-photo/'];

/** Problems of the final _headers text `text` for a build with the flag `on` (empty = fine). */
export function cameraHeaderProblems(text, on) {
  const problems = [];
  const camera = policyFor(text, ID_CAMERA_PATH);
  if (on && camera !== CAMERA_POLICY) problems.push(`_headers: ${ID_CAMERA_PATH} sends Permissions-Policy "${camera ?? '(none)'}", expected "${CAMERA_POLICY}"`);
  if (!on && camera !== SITE_POLICY) problems.push(`_headers: ${ID_CAMERA_PATH} sends Permissions-Policy "${camera ?? '(none)'}" in a build with PUBLIC_ID_CAMERA off`);
  if (!on && text.includes(ID_CAMERA_PATH)) problems.push(`_headers: names ${ID_CAMERA_PATH} in a build with PUBLIC_ID_CAMERA off`);
  for (const p of OTHER_PATHS) {
    const v = policyFor(text, p);
    if (v !== SITE_POLICY) problems.push(`_headers: ${p} sends Permissions-Policy "${v ?? '(none)'}", expected "${SITE_POLICY}"`);
  }
  if ((text.match(/camera=\(self\)/g) ?? []).length !== (on ? 1 : 0)) problems.push(`_headers: camera=(self) appears ${(text.match(/camera=\(self\)/g) ?? []).length} time(s), expected ${on ? 1 : 0}`);
  return problems;
}
