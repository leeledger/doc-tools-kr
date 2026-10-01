// GitHub issues for the ops jobs (docs/OPS-RUNBOOK.md). One open issue per label: a new finding updates it
// (body replaced, a comment added so watchers are notified) instead of opening a duplicate. Uses the workflow's
// GITHUB_TOKEN (permissions: issues: write) and GITHUB_REPOSITORY. In dry-run, or without a token, nothing is
// sent: the intended call is printed.
const API = 'https://api.github.com';

export const LABEL_COLORS = {
  'ops:deploy': 'b60205',
  'ops:health': 'd93f0b',
  'ops:source-changed': 'fbca04',
  'ops:growth': '0e8a16',
  'ops:opportunity': '1d76db',
  'ops:monetize': '5319e7',
};

/**
 * @param {{ token?: string, repo?: string, dryRun?: boolean, fetchImpl?: typeof fetch, log?: (s: string) => void }} o
 */
export function createGitHub({ token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY, dryRun = false, fetchImpl = fetch, log = console.log } = {}) {
  const live = !dryRun && Boolean(token) && Boolean(repo);
  if (!dryRun && (!token || !repo)) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required (or pass --dry-run).');

  async function api(method, path, body) {
    const res = await fetchImpl(`${API}/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'docttak-ops',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 422 && path === '/labels') return null; // the label exists
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? null : res.json();
  }

  /** Issues (never PRs) with the label, newest first. */
  async function issues(label, state = 'open') {
    if (!live) return [];
    const list = await api('GET', `/issues?labels=${encodeURIComponent(label)}&state=${state}&per_page=20&sort=created&direction=desc`);
    return list.filter((i) => !i.pull_request);
  }

  async function ensureLabel(label) {
    if (live) await api('POST', '/labels', { name: label, color: LABEL_COLORS[label] ?? 'ededed' });
  }

  /** Opens an issue, or updates the open one with this label. Returns { action, number }. */
  async function upsert({ label, title, body, comment = '내용을 갱신했습니다.' }) {
    if (!live) {
      log(`[dry-run] issue ${label}: "${title}"\n${body}\n[dry-run] end of issue body`);
      return { action: 'dry-run', number: null };
    }
    await ensureLabel(label);
    const [open] = await issues(label);
    if (open) {
      await api('PATCH', `/issues/${open.number}`, { title, body });
      await api('POST', `/issues/${open.number}/comments`, { body: comment });
      log(`updated issue #${open.number} (${label})`);
      return { action: 'updated', number: open.number };
    }
    const created = await api('POST', '/issues', { title, body, labels: [label] });
    log(`opened issue #${created.number} (${label})`);
    return { action: 'opened', number: created.number };
  }

  /** Comments on and closes every open issue with this label. Returns the numbers closed. */
  async function closeAll(label, comment) {
    if (!live) {
      log(`[dry-run] would close open ${label} issues with: ${comment}`);
      return [];
    }
    const closed = [];
    for (const i of await issues(label)) {
      await api('POST', `/issues/${i.number}/comments`, { body: comment });
      await api('PATCH', `/issues/${i.number}`, { state: 'closed', state_reason: 'completed' });
      closed.push(i.number);
      log(`closed issue #${i.number} (${label})`);
    }
    return closed;
  }

  async function commentOpen(label, comment) {
    if (!live) {
      log(`[dry-run] would comment on open ${label} issues: ${comment}`);
      return [];
    }
    const done = [];
    for (const i of await issues(label)) {
      await api('POST', `/issues/${i.number}/comments`, { body: comment });
      done.push(i.number);
    }
    return done;
  }

  async function create({ label, title, body }) {
    if (!live) {
      log(`[dry-run] new issue ${label}: "${title}"\n${body}\n[dry-run] end of issue body`);
      return { action: 'dry-run', number: null };
    }
    await ensureLabel(label);
    const created = await api('POST', '/issues', { title, body, labels: [label] });
    log(`opened issue #${created.number} (${label})`);
    return { action: 'opened', number: created.number };
  }

  return { live, issues, ensureLabel, upsert, closeAll, commentOpen, create };
}
