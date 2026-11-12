// 「1,234,567」 for "1234567" (QUOTE1112: its own module, so a page that groups digits does not load ./amount).
export const groupDigits = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
