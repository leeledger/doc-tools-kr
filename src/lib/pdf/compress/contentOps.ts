// Minimal content-stream tokenizer: enough to follow q / Q / cm / Do (spike lib.mjs `contentOps`).
// Strings, dictionaries, hex strings and arrays become `null` operands; inline images are skipped.

export type Operand = number | { name: string } | null;

export interface ContentOp {
  op: string;
  args: Operand[];
}

/** Operators and names longer than this are truncated (no argument spread over a huge array). */
export const MAX_TOKEN_BYTES = 256;
/** Parsing stops after this many bytes of content per page. */
export const MAX_CONTENT_BYTES = 200_000_000;

const isWs = (c: number): boolean => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
const isDelim = (c: number): boolean =>
  c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;

function tokenText(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, Math.min(end, start + MAX_TOKEN_BYTES)));
}

/** Tokenizes at most `limit` bytes of `bytes`. */
export function* contentOps(bytes: Uint8Array, limit = MAX_CONTENT_BYTES): Generator<ContentOp> {
  let i = 0;
  const n = Math.min(bytes.length, limit);
  let args: Operand[] = [];
  while (i < n) {
    const c = bytes[i]!;
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === 37) {
      // comment
      while (i < n && bytes[i] !== 10 && bytes[i] !== 13) i++;
      continue;
    }
    if (c === 40) {
      // literal string, balanced parentheses, backslash escapes
      let d = 1;
      i++;
      while (i < n && d) {
        if (bytes[i] === 92) i += 2;
        else {
          if (bytes[i] === 40) d++;
          else if (bytes[i] === 41) d--;
          i++;
        }
      }
      args.push(null);
      continue;
    }
    if (c === 60 && bytes[i + 1] === 60) {
      // dictionary (inline, e.g. BDC properties), may nest and contain strings
      let d = 1;
      i += 2;
      while (i < n && d) {
        if (bytes[i] === 60 && bytes[i + 1] === 60) {
          d++;
          i += 2;
        } else if (bytes[i] === 62 && bytes[i + 1] === 62) {
          d--;
          i += 2;
        } else if (bytes[i] === 40) {
          let dd = 1;
          i++;
          while (i < n && dd) {
            if (bytes[i] === 92) i += 2;
            else {
              if (bytes[i] === 40) dd++;
              else if (bytes[i] === 41) dd--;
              i++;
            }
          }
        } else i++;
      }
      args.push(null);
      continue;
    }
    if (c === 60) {
      // hex string
      while (i < n && bytes[i] !== 62) i++;
      i++;
      args.push(null);
      continue;
    }
    if (c === 91 || c === 93 || c === 123 || c === 125 || c === 62 || c === 41) {
      i++;
      if (c === 91) args.push(null);
      continue;
    }
    if (c === 47) {
      let j = i + 1;
      while (j < n && !isWs(bytes[j]!) && !isDelim(bytes[j]!)) j++;
      args.push({ name: tokenText(bytes, i + 1, j) });
      i = j;
      continue;
    }
    let j = i;
    while (j < n && !isWs(bytes[j]!) && !isDelim(bytes[j]!)) j++;
    if (j === i) {
      i++;
      continue;
    }
    const tok = tokenText(bytes, i, j);
    i = j;
    const num = Number(tok);
    if (!Number.isNaN(num) && /^[+\-.\d]/.test(tok)) {
      args.push(num);
      continue;
    }
    if (tok === 'BI') {
      // skip the inline image up to " EI"
      while (i < n - 2 && !(isWs(bytes[i]!) && bytes[i + 1] === 69 && bytes[i + 2] === 73 && (i + 3 >= n || isWs(bytes[i + 3]!)))) i++;
      i += 3;
      args = [];
      continue;
    }
    yield { op: tok, args };
    args = [];
  }
}
