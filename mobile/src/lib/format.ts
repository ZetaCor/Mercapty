import type { UnitPrice } from './api';

export const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

export const unitPriceText = (up: UnitPrice | null | undefined) => (up ? `${money(up.amount)} / ${up.per}` : '');

const numbers = new Intl.NumberFormat('es-PA');
export const count = (n: number) => numbers.format(n);

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'sin datos';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} día${days === 1 ? '' : 's'}`;
}

export const productLabel = (p: { name: string; brand?: string | null; size?: string | null }) =>
  [p.name, p.brand, p.size].filter(Boolean).join(' · ');

// «Super Xtra, Rey y Riba Smith» (Hermes no trae Intl.ListFormat).
export function joinList(names: string[]) {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

// «ARROSISIMO» -> «Arrosisimo»; los nombres con mayúsculas y minúsculas quedan igual.
export const titleCase = (s: string) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, sp: string, ch: string) => sp + ch.toUpperCase()) : s;

// GTIN-14 guardado -> EAN-13 como aparece impreso en el empaque.
export const displayGtin = (gtin: string) => gtin.replace(/^0(?=\d{13}$)/, '');

export const formatDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('es-PA', { day: 'numeric', month: 'short' });

export function initials(name: string | null | undefined) {
  const words = String(name ?? '').replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

function hexToRgb(color: string | null | undefined): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color ?? '');
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join('') : m[1].slice(0, 6);
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export const safeColor = (color: string | null | undefined) => (hexToRgb(color) ? (color as string) : '#64748b');

// Como color-mix(in srgb, color 14%, white) de la web.
export function tint(color: string | null | undefined, amount = 0.14) {
  const [r, g, b] = hexToRgb(safeColor(color)) as [number, number, number];
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
