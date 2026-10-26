// 명함 그림 drawing (CARD1026 C11): paints layoutCard's plan on a canvas: white card, the accent band, the text lines in
// the system font (no font download; typed names may use letters the site's UI font does not carry) and the contact QR
// with its 4-module quiet zone, drawn from the same modules as the QR preview at an integer module size.
import type { QrModules } from '../../lib/qr/encode';
import { qrRgba } from '../../lib/qr/render';
import { cardModulePx, layoutCard, type CardLayout, type CardPlan } from './layout';
import type { ContactFields } from '../../lib/qr/vcard';

export type CardColor = 'navy' | 'green' | 'black';
/** The three accent colours (C11), in the page's order: 남색, 초록, 검정. */
export const CARD_COLORS: Readonly<Record<CardColor, string>> = { navy: '#1f3c88', green: '#1b7a4b', black: '#222222' };

const FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
const INK: Readonly<Record<string, string>> = { name: '#111111', org: '#222222', info: '#333333' };

const font = (px: number, weight: number): string => `${weight} ${px}px ${FONT}`;

/** Draws the card on `canvas` (resized to the layout) and returns the plan used. */
export function drawCard(canvas: HTMLCanvasElement, f: ContactFields, modules: QrModules, layout: CardLayout, color: CardColor): CardPlan {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('business-card: no 2d context');
  const measure = (text: string, px: number, weight: number): number => {
    ctx.font = font(px, weight);
    return ctx.measureText(text).width;
  };
  const plan = layoutCard(f, layout, measure);
  if (canvas.width !== plan.width) canvas.width = plan.width;
  if (canvas.height !== plan.height) canvas.height = plan.height;
  const accent = CARD_COLORS[color];
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.fillStyle = accent;
  ctx.fillRect(plan.bar.x, plan.bar.y, plan.bar.w, plan.bar.h);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const l of plan.lines) {
    ctx.font = font(l.px, l.weight);
    ctx.fillStyle = l.role === 'role' ? accent : INK[l.role]!;
    ctx.fillText(l.text, l.x, l.y + l.h / 2, l.w);
  }
  // The QR: the largest integer module size that fits the square, centred; putImageData keeps the pixels exact.
  const px = cardModulePx(layout, modules.length);
  const { data, width, height } = qrRgba(modules, px);
  const off = Math.floor((plan.qr.w - width) / 2);
  ctx.putImageData(new ImageData(data, width, height), plan.qr.x + off, plan.qr.y + off);
  return plan;
}
