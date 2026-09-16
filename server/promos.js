// Días de descuento y eventos que anuncian los súper («Martes de frutas y verduras»,
// «Black Friday»), escritos a mano en data/promos.json porque ninguna tienda los publica
// en un formato que un bot pueda leer. Aquí solo se decide cuáles están activos hoy.
//
// Cada promoción lleva:
//   id, storeId, name  - de qué tienda es y cómo se llama.
//   discount           - número (25 = 25 %) o null si no se sabe todavía.
//   weekdays           - días en que se repite: ["martes"]. O, para algo de una vez:
//   from / to          - fechas «2026-11-27» a «2026-11-29» (inclusive).
//   categories         - a qué categorías de Mercapty aplica.
//   keywords           - palabras del nombre que también cuentan, para afinar dentro de una
//                        categoría (la farmacia y los cosméticos comparten «Cuidado personal»).
//   source, note       - dónde lo anuncia la tienda y notas nuestras.
//   enabled            - false mientras no esté confirmada: no se muestra a nadie.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT } from './db.js';
import { stripAccents } from './lib/normalize.js';

const FILE = path.join(ROOT, 'data', 'promos.json');
const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const clean = (text) => stripAccents(String(text ?? '')).toLowerCase().trim();

// Se lee una vez por proceso: el archivo solo cambia al publicar.
let cached;
function load() {
  if (cached) return cached;
  let raw;
  try {
    raw = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch (err) {
    console.warn(`No se pudieron leer las promociones: ${err.message}`);
    return (cached = []);
  }
  cached = (Array.isArray(raw) ? raw : [])
    .filter((p) => p?.enabled !== false && p?.id && p?.storeId)
    .map((p) => ({
      id: String(p.id),
      storeId: String(p.storeId),
      name: String(p.name ?? ''),
      discount: Number.isFinite(p.discount) ? p.discount : null,
      weekdays: (Array.isArray(p.weekdays) ? p.weekdays : []).map(clean).filter((d) => DAYS.includes(d)),
      from: p.from ?? null,
      to: p.to ?? null,
      categories: Array.isArray(p.categories) ? p.categories.filter(Boolean) : [],
      keywords: (Array.isArray(p.keywords) ? p.keywords : []).map(clean).filter(Boolean),
      source: p.source || null,
    }))
    // Sin día ni fechas no se sabe cuándo aplica.
    .filter((p) => p.weekdays.length || p.from || p.to);
  return cached;
}

// Qué día es hoy en Panamá, sin depender de la hora del servidor (Vercel corre en UTC).
export function panamaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const value = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: DAYS[EN_DAYS.indexOf(value('weekday'))] ?? '',
  };
}

// Promociones que aplican hoy en Panamá.
export function activePromos(now = new Date()) {
  const { date, weekday } = panamaToday(now);
  return load().filter((p) => (p.from || p.to
    ? (!p.from || date >= p.from) && (!p.to || date <= p.to)
    : p.weekdays.includes(weekday)));
}
