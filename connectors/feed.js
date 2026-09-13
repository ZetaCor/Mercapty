// Conector para tiendas que comparten su inventario con PanaPrecio mediante
// un archivo CSV o JSON (local o publicado en una URL). Es la vía recomendada
// para socios: la tienda controla qué publica y con qué frecuencia.
//
// Columnas: sku, gtin, nombre, marca, categoria, presentacion, precio,
//           precio_regular, disponible, url, imagen (URL de la foto, opcional)
import { readFileSync } from 'node:fs';
import path from 'node:path';

export async function fetchOffers(store, { root }) {
  const { file, url } = store.connector;
  let text;
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo descargar el feed (${res.status})`);
    text = await res.text();
  } else {
    text = readFileSync(path.resolve(root, file), 'utf8');
  }

  const source = file ?? url;
  const rows = source.endsWith('.json') ? JSON.parse(text) : parseCsv(text);
  return rows.map((row) => ({
    sku: row.sku,
    gtin: row.gtin,
    title: row.nombre,
    name: row.nombre,
    brand: row.marca,
    category: row.categoria,
    size: row.presentacion,
    price: row.precio,
    listPrice: row.precio_regular,
    inStock: !/^(0|no|false)$/i.test(String(row.disponible ?? '').trim()),
    url: row.url,
    image: row.imagen,
  }));
}

// CSV con encabezados, comillas dobles y separador "," o ";" (Excel en
// español suele exportar con ";").
export function parseCsv(text) {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM de Excel
  const firstLine = clean.split('\n', 1)[0];
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const records = [];
  let field = '', record = [], quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { record.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      record.push(field); field = '';
      if (record.some((v) => v.trim() !== '')) records.push(record);
      record = [];
    } else field += ch;
  }
  record.push(field);
  if (record.some((v) => v.trim() !== '')) records.push(record);

  const [header, ...body] = records;
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((values) => Object.fromEntries(keys.map((k, i) => [k, (values[i] ?? '').trim()])));
}
