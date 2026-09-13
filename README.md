# Mercapty

Comparador de precios de supermercados en línea de Panamá. El cliente busca un producto, ve el
precio en cada tienda, cuál lo tiene más barato, y con un clic va a esa tienda a comprarlo.
También arma una lista de compras y calcula si conviene comprar todo en un solo súper o repartir.

Los precios los recogen **bots propios** que recorren las webs de los súper cada 6 horas.

## Qué hace

- **Búsqueda** por nombre, marca o código de barras (sin importar tildes) y por categoría.
- **Ficha de producto:** precio en cada tienda ordenado de menor a mayor, mejor precio destacado,
  ofertas, disponibilidad, precio por kg/L, historial y botón **«Comprar en…»**.
- **Redirección medible:** `/go/:id` registra el clic y envía al cliente a la tienda con
  `utm_source=mercapty`. Esa cifra es la base para negociar comisiones.
- **Mi lista:** compara «todo en una tienda» contra «repartir cada producto donde está más barato».
- **Tiendas:** cuántos productos tiene cada una, en cuántos gana y cuántas visitas le enviamos.
- **Fotos:** las que publica cada tienda, o las que subes tú desde el panel de imágenes.

## Cómo funciona

```
 GitHub Actions (cada 6 h)                     Vercel
 ┌───────────────────────┐                    ┌───────────────────────────────┐
 │ bots: vtex, woocommerce│ ── escriben ──►   │ public/  (páginas)            │
 │ scripts/ingest.js      │     Turso  ◄──────│ api/index.js → server/app.js  │
 └───────────────────────┘   (base SQLite)    │ fotos subidas → Vercel Blob   │
                                              └───────────────────────────────┘
```

La clave es **reconocer que dos tiendas venden el mismo producto**. Se usa el código de barras
(GTIN/EAN), normalizado a 14 dígitos: Super Xtra publica la leche Estrella Azul como
`88209972267` (UPC sin el cero inicial) y queda igual al `088209972267` de otra tienda. Sin código
de barras, se usa marca + nombre + presentación como respaldo. Las categorías de cada súper se
unifican en una lista común (`canonicalCategory` en `server/lib/normalize.js`).

## Supermercados (septiembre 2026)

| Súper | Plataforma | Estado |
|---|---|---|
| Super Xtra | VTEX | ✅ Bot activo (API pública de catálogo) |
| El Machetazo | VTEX | ✅ Bot activo (API pública de catálogo) |
| Superunico | WooCommerce | ✅ Bot activo (Store API pública) |
| Súper 99 | Magento | ⏳ Pendiente: su API de productos responde con error |
| Riba Smith | Next.js | ⏳ Pendiente: cambió su sitio, falta ubicar su API de búsqueda |
| Supermercados Rey | App Rey Delivery | ⏳ Pendiente: vende solo por app |

Las tiendas se configuran en `data/stores.json`. Una tienda con `"enabled": false` se omite.

## Publicar en Vercel (una sola vez)

1. **Base de datos:** en tu proyecto de Vercel → **Storage** → **Create Database** → **Turso** →
   conéctala al proyecto. Vercel agrega `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
2. **Fotos:** **Storage** → **Create** → **Blob** → conéctalo al proyecto. Vercel agrega
   `BLOB_READ_WRITE_TOKEN`.
3. **Clave del panel:** **Settings** → **Environment Variables** → agrega `ADMIN_KEY` con una
   clave larga que solo tú conozcas.
4. **Secretos de los bots:** en GitHub → **Settings** → **Secrets and variables** → **Actions**,
   crea `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` con los mismos valores del paso 1.
5. **Redeploy** en Vercel para que tome las variables.
6. **Primera carga de precios:** en GitHub → **Actions** → **Actualizar precios** → **Run workflow**.
   Después corre sola cada 6 horas.

Panel de imágenes en producción: `https://tu-sitio.vercel.app/#/admin` (pide la `ADMIN_KEY`).

## Trabajar en local

Requisitos: Node.js 22.

```bash
npm install
npm run ingest   # corre los bots y guarda en data/precios.db
npm start        # http://localhost:3000 (npm start -- 3001 para otro puerto)
```

Sin `TURSO_DATABASE_URL`, todo usa el archivo local `data/precios.db`. Si defines esa variable,
los bots y el servidor usan Turso. Prueba rápida de los bots:
`INGEST_QUERIES="leche,arroz" INGEST_MAX_PAGES=1 npm run ingest`.

## Los bots

- **VTEX** (`connectors/vtex.js`): busca ~40 términos de canasta básica en la API pública de catálogo.
  Trae código de barras, precio, precio regular, disponibilidad, foto y enlace al producto.
- **WooCommerce** (`connectors/woocommerce.js`): recorre el catálogo completo por la Store API.
- **Feed** (`connectors/feed.js`): para tiendas socias que comparten su inventario en CSV/JSON con
  las columnas `sku,gtin,nombre,marca,categoria,presentacion,precio,precio_regular,disponible,url,imagen`
  (ejemplo en `data/feeds/minisuper-ejemplo.csv`).

Cuidados que tienen los bots:
- Se identifican como `MercaptyBot` y esperan 1.5 s entre peticiones.
- Si una tienda no responde o devuelve 0 productos, no se toca lo guardado.
- Si llegan muchos menos productos que la vez anterior, no se marca nada como agotado.

Para sumar una tienda, crea `connectors/<nombre>.js` con
`fetchOffers(store) -> [{ sku, gtin, name, brand, category, size, price, listPrice, inStock, url, image }]`
y regístralo en `connectors/index.js`.

**Importante:** revisa los términos de uso de cada súper. Lo ideal es un acuerdo (feed o
afiliados): da precios más confiables y abre la puerta a cobrar comisión.

## Fotos de productos

La foto que subes tú siempre tiene prioridad sobre la de la tienda.

1. **Panel de imágenes** (`/#/admin`): sube o arrastra una foto a cada producto, filtra los que no
   tienen foto o quita fotos. En local, `npm start` muestra un enlace con la clave (guardada en
   `data/admin-key.txt`). En Vercel, la clave es `ADMIN_KEY`.
2. **Tiendas:** los bots traen la foto que publica cada tienda.

El navegador reduce la foto a 1000 px y le quita metadatos, como la ubicación GPS, antes de
subirla. El servidor acepta JPG, PNG o WebP de hasta 3 MB y la guarda en Vercel Blob; en local, en
`data/images/`.

## Antes de crecer

- **Precios exactos:** se muestra la fecha de actualización y se aclara que el precio final lo
  confirma la tienda (Ley 45 de 2007 de protección al consumidor).
- **Datos personales:** la lista se guarda solo en el navegador. Si agregas cuentas o alertas,
  aplica la Ley 81 de 2019.
- **Envío:** los totales no incluyen envío; agregar tarifa y mínimo de cada tienda mejora «Mi lista».

## Próximos pasos

1. Bots para Súper 99 y Riba Smith.
2. Revisión de coincidencias entre tiendas para productos sin código de barras.
3. Alertas de baja de precio y escaneo de código de barras con la cámara.
4. Acuerdos con tiendas (feed o afiliados).

## Estructura

```
api/index.js    función de Vercel (usa server/app.js)
connectors/     bots: vtex.js, woocommerce.js, feed.js
scripts/        ingest.js: corre los bots y guarda en la base
server/         app.js (rutas), api.js (consultas), db.js (Turso/SQLite), storage.js (fotos), index.js (local)
public/         index.html, styles.css, js/ (app.js, images.js, views/)
data/           stores.json, feeds/   · generados (fuera de git): precios.db, images/, admin-key.txt
.github/        workflows/precios.yml: bots cada 6 horas
```
