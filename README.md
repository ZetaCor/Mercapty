# Mercapty

Comparador de precios de supermercados en línea de Panamá. El cliente busca un producto, ve el
precio en cada tienda, cuál lo tiene más barato, y con un clic va a esa tienda a comprarlo.
También arma una lista de compras y calcula si conviene comprar todo en un solo súper o repartir.

Los precios los recogen **bots propios** que recorren las webs de los súper una vez al día.

## Qué hace

- **Búsqueda** por nombre, marca o código de barras (sin importar tildes) y por categoría, ordenada por
  relevancia: al buscar «leche» salen primero las leches y después lo que solo la contiene («arroz con
  leche»). Entiende singular y plural y sinónimos («soda», «refresco» y «gaseosa») y, si ninguna
  coincidencia tiene todas las palabras, muestra las más parecidas con un aviso. Lo normal va antes que
  las variantes y la unidad antes que los paquetes: «coca cola» muestra primero la Coca-Cola regular
  suelta; la Zero, la Light o el «Pack de 12» suben si se escriben. También suben los productos que se
  pueden comparar en más tiendas.
- **Parecidos en otras tiendas:** en cada ficha, productos de otras tiendas que se parecen pero no se
  unieron (otro nombre u otra presentación), para comparar a mano.
- **Ficha de producto:** precio en cada tienda ordenado de menor a mayor, mejor precio destacado,
  ofertas, disponibilidad, precio por kg/L, historial y botón **«Comprar en…»**.
- **Redirección medible:** `/go/:id` registra el clic y envía al cliente a la tienda con
  `utm_source=mercapty`. Esa cifra es la base para negociar comisiones.
- **Mi lista:** compara «todo en una tienda» contra «repartir cada producto donde está más barato».
- **Tiendas:** cuántos productos tiene cada una, en cuántos gana y cuántas visitas le enviamos.
- **Fotos:** las que publica cada tienda, o las que subes tú desde el panel de imágenes.
- **Logos de las tiendas:** junto a cada precio aparece el ícono del súper (antes, sus iniciales), y la
  portada tiene una franja con los logos de los supermercados que se comparan hoy. La franja se desliza
  sola, se detiene al pasar el mouse y queda quieta para quien pidió menos movimiento en su equipo.

## Cómo funciona

```
 GitHub Actions (1 al día)                     Vercel
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

**Paquetes:** «946 ml (Pack de 12)», «6 pack», «Caja de 24» o «6 x 355 ml» se reconocen como
paquetes. Un paquete nunca se une con la unidad, aunque la tienda use el mismo código de barras, y
su precio por litro o por kilo se calcula sobre el total. Los códigos internos de productos pesados
(prefijos 2, 02 y 04) se descartan porque cada tienda inventa los suyos. También se descartan los códigos
cuyo dígito verificador no cuadra (SKU internos que parecen códigos de barras).

**Emparejamiento por nombre** (`server/lib/matching.js`): los productos sin código de barras (los
internos de Riba Smith, por ejemplo), o con uno que ninguna otra tienda usa, se unen con el mismo
producto de otra tienda solo si se cumplen todas estas reglas:
- el tamaño por unidad y la cantidad de unidades coinciden (con 3 % de margen, así 2 lb ≈ 908 g) y la
  marca coincide;
- la categoría es la misma;
- los nombres se parecen al menos 75 %. Se ignoran las palabras de empaque y medida («UHT», «Pura»,
  «Suelta», «Caja», «litros»…) y se entienden abreviaturas («desl», «intg», «c/») y nombres cortados;
- ninguna palabra de variante («entera», «descremada», «light», «pavo», «soya», «girasol»…) aparece en
  un solo nombre, y no puede haber palabras distintas en los dos nombres a la vez (girasol/soya): solo
  se permiten palabras de más en uno de ellos («Aceite Pabo» ≈ «Aceite Pabo Vegetal»).

Sin marca o sin tamaño no se une: compararlo con un producto concreto engañaría al cliente. Esos
productos aparecen en «Parecidos en otras tiendas». Cada producto de otra tienda se une con uno solo.
Para revisar las uniones: `INGEST_SHOW_MATCHES=1 npm run ingest -- ribasmith`.

## Supermercados (septiembre 2026)

| Súper | Plataforma | Estado |
|---|---|---|
| Super Xtra | VTEX | ✅ Bot activo: recorre completos sus departamentos de súper (API pública de catálogo) |
| El Machetazo | VTEX | ✅ Bot activo: recorre completos Supermercado y Bebés (API pública de catálogo) |
| Superunico | WooCommerce | ✅ Bot activo (Store API pública) |
| Súper 99 | Magento | ⏳ Pendiente: sus listados los arma un buscador externo (Adobe Live Search) que exige su clave, y la búsqueda de su API interna devuelve 0 productos. Leer producto por producto (unos 42 000) tomaría horas: hace falta un acuerdo o un feed |
| Riba Smith | Next.js | ✅ Bot activo (busca los términos de canasta básica en su web). Publica el código de barras sin el dígito verificador: se completa; lo que no tiene código se une por nombre, tamaño y marca |
| Supermercados Rey | Instaleap | ✅ Bot activo (API de catálogo de Instaleap) |
| Metro Plus | Tipti | ⏳ Vende en línea por Tipti, cuya API exige iniciar sesión: hace falta un acuerdo o un feed |
| PriceSmart | Nuxt + Bloomreach | ⛔ Su robots.txt bloquea expresamente a los bots que copian datos: solo con acuerdo o feed |
| Super Kosher | Self-Point | ⛔ Su robots.txt lo permite, pero Cloudflare bloquea a los bots en su API de productos: solo con acuerdo o feed |

La portada y el pie de página muestran automáticamente cuántos y cuáles supermercados tienen precios hoy.

Las tiendas se configuran en `data/stores.json`. Una tienda con `"enabled": false` se omite.

Cada tienda puede tener `logo` (horizontal, para la franja de la portada y la página de tiendas), `icon`
(cuadrado, junto a cada precio) y `logoBg` (fondo para logos blancos, como el de Superunico). Hoy apuntan a
las imágenes que cada súper publica en su propia web; si alguna deja de cargar, se muestran su nombre o
sus iniciales. Para usar archivos propios, guárdalos en `public/logos/` y pon la ruta (`"/logos/rey.png"`).
Los cambios llegan a la web la próxima vez que corren los bots.

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
   Después corre sola una vez al día (5:17 a. m. de Panamá).

Panel de imágenes en producción: `https://tu-sitio.vercel.app/admin` (pide la `ADMIN_KEY`).

## Trabajar en local

Requisitos: Node.js 22.

```bash
npm install
npm run ingest   # corre los bots y guarda en data/mercapty.db
npm start        # http://localhost:3000 (npm start -- 3001 para otro puerto)
```

Sin `TURSO_DATABASE_URL`, todo usa el archivo local `data/mercapty.db`. Si defines esa variable,
los bots y el servidor usan Turso. Prueba rápida de los bots:
`INGEST_QUERIES="leche,arroz" INGEST_MAX_PAGES=1 npm run ingest`.

## Los bots

- **VTEX** (`connectors/vtex.js`): con `"mode": "categories"` recorre completos, con la API pública de
  catálogo, los departamentos de `departments` (`{ "id", "name" }`). Así no se escapa ningún producto
  (antes faltaban el ron Flor de Caña o la Coca-Cola normal porque ninguna palabra los buscaba). VTEX no
  pagina más allá de 2 500 productos por consulta: si un departamento tiene más, se parte por rangos de
  precio. Solo se leen productos con precio desde $0.01: VTEX pone precio 0 a lo agotado (en el súper de
  Super Xtra son casi 2 900). Super Xtra: Supermercado, Licores, Limpieza, Cuidado personal, Bebés y Mascotas (quedan fuera
  farmacia, ferretería y electrodomésticos). El Machetazo: Supermercado y Bebés (queda fuera su almacén).
  Trae código de barras, precio, precio regular, disponibilidad, foto y enlace. Si la tienda responde 429
  o 5xx, o se corta la red, espera y reintenta. Sin ese modo, busca los términos de `GROCERY_QUERIES`.
  El id de cada departamento aparece en el campo `categoriesIds` de cualquier producto
  (`/api/catalog_system/pub/products/search?ft=leche`).
- **WooCommerce** (`connectors/woocommerce.js`): recorre el catálogo completo por la Store API.
- **Instaleap** (`connectors/instaleap.js`): Supermercados Rey. Busca los términos de `GROCERY_QUERIES`
  (`connectors/util.js`: unos 100, entre canasta básica, sodas y marcas, licores, limpieza, bebé y
  mascotas) en la API de catálogo de Instaleap, que no permite listar el catálogo completo. Si falta un
  producto de Rey o de Riba Smith, se agrega la palabra a esa lista. Rey y Riba Smith leen hasta 4 páginas
  por palabra (`"maxPages": 4` en `data/stores.json`): así entran los ~200 rones de Rey y los ~160 de Riba
  Smith, que con 2 páginas quedaban a la mitad.
- **Riba Smith** (`connectors/ribasmith.js`): busca en su web los mismos términos que VTEX y lee los datos
  que la página incluye: precio con ITBMS, oferta con fechas e inventario. Su campo `sku` es el código de
  barras sin el dígito verificador (`744100350023` = Coca-Cola lata `7441003500235`); el bot lo completa
  para que se una con las demás tiendas. Con `"mode": "departments"` recorre el catálogo completo por
  departamento (`/dep_product/<nombre>-<id>?page=N`; `skipDepartments` omite los que no son de súper), pero
  son cientos de páginas de 20 productos (solo Bebé tiene 38): demasiados minutos de GitHub Actions para un
  repositorio privado. Si una página falla, el bot reintenta y, si sigue fallando, la salta.
- **Feed** (`connectors/feed.js`): para tiendas socias que comparten su inventario en CSV/JSON con
  las columnas `sku,gtin,nombre,marca,categoria,presentacion,precio,precio_regular,disponible,url,imagen`
  (ejemplo en `data/feeds/minisuper-ejemplo.csv`).

Cuidados que tienen los bots:
- Se identifican como `MercaptyBot` y esperan 1.5 s entre peticiones.
- Si una tienda no responde o devuelve 0 productos, no se toca lo guardado.
- Si llegan muchos menos productos que la vez anterior, no se marca nada como agotado.
- Un recorrido completo tarda cerca de media hora (Super Xtra unos 8 minutos y El Machetazo 6, porque se
  leen completos). En un repositorio privado, GitHub Actions da 2 000 minutos gratis al mes: alcanzan para
  una corrida al día. Con el repositorio público los minutos no tienen límite y se puede volver a dos
  corridas diarias (`cron: '17 5,17 * * *'` en `.github/workflows/precios.yml`).

Para sumar una tienda, crea `connectors/<nombre>.js` con
`fetchOffers(store) -> [{ sku, gtin, name, brand, category, size, price, listPrice, inStock, url, image }]`
y regístralo en `connectors/index.js`.

### Cómo funciona el bot de Rey (Instaleap)

- smrey.com es Next.js sobre Instaleap (`clientId: GRUPO_REY`, tienda `1038`, «Calle 50»).
- El catálogo se consulta en `POST https://nextgentheadless.instaleap.io/api/v3` con
  `searchProducts(searchProductsInput: { clientId, storeReference, search: [{ query }], currentPage, pageSize })`.
- Cada producto trae nombre, precio, código de barras (`ean`), disponibilidad, foto y `slug`. La
  página del producto es `https://www.smrey.com/p/<slug>`.

**Importante:** revisa los términos de uso de cada súper. Lo ideal es un acuerdo (feed o
afiliados): da precios más confiables y abre la puerta a cobrar comisión.

## Fotos de productos

La foto que subes tú siempre tiene prioridad sobre la de la tienda.

1. **Panel de imágenes** (`/admin`): sube o arrastra una foto a cada producto, filtra los que no
   tienen foto o quita fotos. En local, `npm start` muestra un enlace con la clave (guardada en
   `data/admin-key.txt`). En Vercel, la clave es `ADMIN_KEY`.
2. **Tiendas:** los bots traen la foto que publica cada tienda.

El navegador reduce la foto a 1000 px y le quita metadatos, como la ubicación GPS, antes de
subirla. El servidor acepta JPG, PNG o WebP de hasta 3 MB y la guarda en Vercel Blob; en local, en
`data/images/`.

## App

La página `/app` («Descarga la app») permite instalar Mercapty hoy como app web (PWA): en Android
aparece el botón «Instalar Mercapty» y en iPhone se explica cómo agregarla desde Compartir. Para eso
existen `public/manifest.webmanifest`, los íconos de `public/icons/` y un service worker mínimo
(`public/sw.js`) que siempre busca primero en la red y nunca guarda precios. Las versiones de App Store y
Google Play aparecen como «Próximamente».

## Anuncios (Google AdSense)

Los espacios ya están colocados en la portada, la búsqueda y la ficha de producto. En tu computadora se
ven como recuadros punteados; en la web no aparecen hasta que configures AdSense.

1. Compra el dominio y conéctalo en Vercel (**Settings** → **Domains**).
2. En la política de privacidad (`public/privacidad.html`), cambia `[correo de contacto pendiente]` por tu
   correo. AdSense exige esa página.
3. Solicita AdSense con tu dominio. Cuando te aprueben, en Vercel → **Environment Variables** agrega
   `ADSENSE_CLIENT` con tu ID (`ca-pub-…`) y haz **Redeploy**. Con eso se carga el script de AdSense y
   `/ads.txt` se genera solo.
4. Opcional: crea bloques de anuncios en AdSense y agrega sus números en `ADSENSE_SLOT_HOME`,
   `ADSENSE_SLOT_SEARCH` y `ADSENSE_SLOT_PRODUCT`. Sin bloques, puedes usar los anuncios automáticos de AdSense.

## Google (SEO)

- Cada página tiene su dirección normal: `/producto/45-leche-de-oro-250-ml-entera-fresca`, `/buscar?categoria=Despensa`,
  `/tiendas`, `/app`. Los enlaces viejos con `#` siguen funcionando.
- El servidor entrega cada página con su título, descripción, dirección canónica, vista previa para redes
  (Open Graph) y, en los productos, datos estructurados de Google (precio más bajo y más alto).
- `/sitemap.xml` lista todos los productos con precio y `/robots.txt` apunta a él. Las búsquedas por
  palabra, «Mi lista» y el panel no se indexan.
- Con dominio propio, define `SITE_URL` (por ejemplo `https://mercapty.com`) en Vercel para que las
  direcciones canónicas usen tu dominio, y registra el sitio y el sitemap en
  [Google Search Console](https://search.google.com/search-console).

## Antes de crecer

- **Precios exactos:** se muestra la fecha de actualización y se aclara que el precio final lo
  confirma la tienda (Ley 45 de 2007 de protección al consumidor).
- **Datos personales:** la lista se guarda solo en el navegador. Si agregas cuentas o alertas,
  aplica la Ley 81 de 2019.
- **Envío:** los totales no incluyen envío; agregar tarifa y mínimo de cada tienda mejora «Mi lista».

## Próximos pasos

1. Súper 99: pedir un feed o un acuerdo (su web no deja leer el catálogo sin su clave).
2. Revisión de coincidencias entre tiendas para productos sin código de barras.
3. Alertas de baja de precio y escaneo de código de barras con la cámara.
4. Acuerdos con tiendas (feed o afiliados).

## Estructura

```
api/index.js    función de Vercel (usa server/app.js)
connectors/     bots: vtex.js, woocommerce.js, instaleap.js, ribasmith.js, feed.js
scripts/        ingest.js: corre los bots y guarda en la base
server/         app.js (rutas), api.js (consultas), db.js (Turso/SQLite), storage.js (fotos), index.js (local)
public/         index.html, styles.css, js/ (app.js, images.js, views/)
data/           stores.json, feeds/   · generados (fuera de git): mercapty.db, images/, admin-key.txt
.github/        workflows/precios.yml: bots una vez al día
```
