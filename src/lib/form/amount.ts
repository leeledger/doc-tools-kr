// 금액을 한글로 (LOAN1022 L-D3): 「일천만」 for 10000000. Pure, own code (no package). Groups of 4 digits from the
// right with 만/억 (조 for 13+ digits, which the form never sends: amount fields stop at 12 digits); inside a group 천/백/십
// always with the digit name, 1 included (일천, 일백, 일십: the habit of a 차용증, which leaves no room to add a digit);
// all-zero groups are left out. Document text only.

const DIGIT = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const PLACE = ['천', '백', '십', ''];
const GROUP = ['', '만', '억', '조'];

/** 「일천이백삼십사만오천」 for "12345000"; 「영」 for zeros. `digits`: 1–16 decimal digits (anything else throws). */
export function amountHangul(digits: string): string {
  if (!/^\d{1,16}$/.test(digits)) throw new RangeError('amountHangul: 1–16 digits');
  const d = digits.replace(/^0+/, '');
  if (!d) return '영';
  const padded = d.padStart(Math.ceil(d.length / 4) * 4, '0');
  const groups = padded.length / 4;
  let out = '';
  for (let g = 0; g < groups; g++) {
    const part = padded.slice(g * 4, g * 4 + 4);
    if (part === '0000') continue;
    for (let i = 0; i < 4; i++) {
      const n = Number(part[i]);
      if (n) out += DIGIT[n]! + PLACE[i]!;
    }
    out += GROUP[groups - 1 - g]!;
  }
  return out;
}

/** 「1,234,567」 for "1234567". */
export const groupDigits = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
