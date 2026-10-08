// Unique names inside one ZIP (shared by every tool that saves several files).

/**
 * Names made unique for Windows Explorer (case-insensitive): the second "a.jpg" becomes "a_2.jpg",
 * the third "a_3.jpg", skipping any name already taken.
 */
export function dedupeNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let k = 2; taken.has(candidate.toLowerCase()); k++) candidate = `${base}_${k}${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
