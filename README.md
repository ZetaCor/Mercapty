# Mercapty

Comparador de precios de supermercados en línea de Panamá. El cliente busca un producto, ve el
precio en cada tienda, cuál lo tiene más barato, y con un clic va a esa tienda a comprarlo.
También arma una lista de compras y calcula si conviene comprar todo en un solo súper o repartir.

Los precios los recogen **bots propios** que recorren las webs de los súper dos veces al día (Súper 99,
cada noche).

## Qué hace

- **Búsqueda** por nombre, marca o código de barras (sin importar tildes) y por categoría, ordenada por
  relevancia: al buscar «leche» salen primero las leches y después lo que solo la contiene («arroz con
  leche»). Entiende singular y plural y sinónimos («soda», «refresco» y «gaseosa») y, si ninguna
  coincidencia tiene todas las palabras, muestra las más parecidas con un aviso. Lo normal va antes que
  las variantes y la unidad antes que los paquetes: «coca cola» muestra primero la Coca-Cola regular
  suelta; la Zero, la Light o el «Pack de 12» suben si se escriben. También suben los productos que se
  pueden comparar en más tiendas.
- **Productos parecidos:** en cada ficha, primero otros tamaños o variantes de la misma marca («Más de
  Arrosisimo») y después el mismo producto de otras marcas («Otras marcas»: otros arroces), con el tamaño
  más parecido y lo que se compara en más tiendas primero.
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
 GitHub Actions (2 al día)                     Vercel
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
unifican en una lista común (`canonicalCategory` en `server/lib/normalize.js`). Como nombre se queda el
más completo: si una tienda guardó «Ron Claro» y otra trae «Ron Carta Vieja 750 Ml Claro» (con tamaño o
marca), se cambia por ese.

**Categorías:** primero decide cómo empieza el nombre del producto («Aceite Pam» → Despensa, «Arepa de maíz»
→ Panadería y snacks, «Pasta dental» → Cuidado personal; `categoryFromName`), porque cada súper mete cosas
distintas en secciones como «Refrigerados». Si el nombre no lo dice («Doritos Queso»), decide la categoría de
la tienda. Si el nombre empieza con una marca que suele ir antes del producto («General Mills Cereal…», «Quaker
Avena…»), decide la palabra siguiente; y unas pocas palabras deciden aunque vayan después (cereal, gelatina, levadura,
«cake mix»), nunca un sabor. Los cereales, la avena y lo de repostería (bicarbonato, mezclas, glaseado; también la
sección «Repostería» de las tiendas) van en Despensa; las barras de cereal o de granola, en Panadería y snacks. Los
aceites corporales o para el cabello, los suplementos (Ensure, Glucerna…), la sal de frutas, las cremas corporales y el
agua micelar, de rosas o de colonia van en Cuidado personal; lo de bebé (aceite, shampoo, talco o crema de bebé) y
Pediasure, en Bebé; el aceite de motor, los cigarrillos y los termos, en Otros. El té en bolsitas o sobres va en Despensa,
con el café, y el que ya viene para tomar (té frío, con ml o litros), en Bebidas; las bebidas de almendra, soya o avena
van con la leche, en Lácteos y huevos, y la leche de coco, en Despensa. Al final de cada corrida de los bots, cada producto se reubica según su nombre (`recategorize` en
`scripts/lib/pipeline.js`). Al ver una categoría, primero salen los productos que se comparan en más tiendas.

**Lecturas de la base:** Turso cobra por filas leídas, así que la web no recorre las ofertas en cada
visita. Al final de cada corrida, los bots dejan calculado en `product_best` el mejor precio de cada
producto, en cuántas tiendas está, el precio más alto y cuánto se ahorra, y en `stats` los totales de la
portada, de las categorías y de cada tienda (`rebuildAggregates` en `server/db.js`); solo se escriben las
filas que cambiaron, porque las escrituras también se cobran. Con eso, la portada, los listados, las
ofertas del día, el mapa del sitio y los «productos parecidos» leen decenas de filas en vez de recorrer
toda la tabla. Además, las páginas y las respuestas de `/api/` se guardan diez minutos en la red de
Vercel y se siguen sirviendo mientras se pide una copia nueva, así que casi ninguna visita llega a la
base. Si `product_best` está vacío (base recién creada), el servidor lo calcula solo la primera vez.
La búsqueda por palabras usa un índice de texto (FTS5, `products_fts`), que tres disparadores mantienen
al día solo cuando cambia el nombre de un producto; si la base no lo soportara, se recorren los nombres
como antes y todo sigue funcionando igual.
El servidor web tampoco crea las tablas al arrancar, porque en Vercel eso lo pagaría cada arranque
en frío: de eso se encargan los bots (`createSchema`), y si faltaran, la API las crea al vuelo.

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
productos aparecen en «Productos parecidos». Cada producto de otra tienda se une con uno solo.
Para revisar las uniones: `INGEST_SHOW_MATCHES=1 npm run ingest -- ribasmith`.

## Supermercados (septiembre 2026)

| Súper | Plataforma | Estado |
|---|---|---|
| Super Xtra | VTEX | ✅ Bot activo: recorre completos sus departamentos de súper (API pública de catálogo) |
| El Machetazo | VTEX | ✅ Bot activo: recorre completos Supermercado y Bebés (API pública de catálogo) |
| Superunico | WooCommerce | ✅ Bot activo (Store API pública) |
| Súper 99 | Magento | ✅ Bot propio: lee sus páginas de producto una por una (traen código de barras), unas 5 000 cada noche |
| Riba Smith | Next.js | ✅ Bot activo (busca los términos de canasta básica en su web). Publica el código de barras sin el dígito verificador: se completa; lo que no tiene código se une por nombre, tamaño y marca |
| Supermercados Rey | Instaleap | ✅ Bot activo (API de catálogo de Instaleap) |
| Metro Plus | Tipti | ⏳ Vende en línea por Tipti, cuya API exige iniciar sesión: hace falta un acuerdo o un feed |
| PriceSmart | Nuxt + Bloomreach | ⛔ Su robots.txt bloquea expresamente a los bots que copian datos: solo con acuerdo o feed |
| Super Kosher | Self-Point | ⛔ Su robots.txt lo permite, pero Cloudflare bloquea a los bots en su API de productos: solo con acuerdo o feed |
| Super Carnes | Magento | ✅ Bot activo: lee sus 529 subcategorías de súper (hasta 160 productos por página, con código de barras): unos 3 800 productos en ~24 min |
| Alimentos Melo | Shopify | ✅ Bot activo: su catálogo público de Shopify (unos 80 productos de pollo, cerdo, embutidos, jugos…) en una consulta. Sin código de barras: se une por nombre, marca y tamaño |
| Mr Precio | WordPress | ⛔ No vende en línea: su web solo tiene sucursales y un PDF de ofertas (es del Grupo Rey) |

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
   Después corre sola dos veces al día (5:17 a. m. y 5:17 p. m. de Panamá). Súper 99 tiene su propio
   trabajo, **Súper 99**, que corre cada noche a las 10:07 p. m.

Panel de imágenes en producción: `https://mercapty.com/admin` (pide la `ADMIN_KEY`).

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
- **Súper 99** (`connectors/super99.js` y `scripts/super99.js`, `npm run super99`): sus listados los arma un
  buscador externo que exige su clave, pero la página de cada producto trae nombre, marca, precio, precio
  anterior, código de barras (UPC), existencias y categorías, y su robots.txt permite leerla. Son unas 42 500
  páginas (unas 40 horas a un ritmo que no sature su web), así que tiene su propio trabajo nocturno
  (`.github/workflows/super99.yml`, 10:07 p. m.) que lee lo que alcanza en ~5 h 20 min (unas 5 000 páginas);
  la noche siguiente sigue donde quedó. La primera vuelta al catálogo toma unas 8 noches. Orden: primero relee a diario los productos que también venden otras tiendas (los que
  sirven para comparar), luego los que aún no conoce y después el resto, del que lleva más tiempo sin leerse.
  La tabla `store_pages` guarda cuándo se leyó cada página y qué se encontró. Solo guarda productos de sus
  departamentos de súper (`departments` en `data/stores.json`); farmacia, ferretería o juguetería se saltan.
  Un precio que no se relee en 14 días deja de mostrarse. Prueba corta: `SUPER99_MINUTES=2 npm run super99`.
- **Magento por categorías** (`connectors/magento.js`): Super Carnes. Sus páginas de categoría traen hasta 160
  productos con nombre, precio, precio anterior, foto y código de barras (su SKU, que también va al final de
  la dirección del producto). Sus categorías cargan más productos al bajar (no hay páginas `?p=2`), así que se
  leen las subcategorías finales de sus departamentos de súper (`departments`), que su mapa del sitio lista y
  que caben en una página. Su API interna (GraphQL) responde 403 a los bots, así que no se usa.
- **Shopify** (`connectors/shopify.js`): Alimentos Melo. Toda tienda Shopify publica su catálogo en
  `/products.json` (hasta 250 productos por página): nombre, marca, tipo, presentación, precio, precio anterior,
  existencias y foto. No trae el código de barras, así que estos productos se unen por nombre, marca y tamaño;
  los que no dicen su tamaño aparecen solo con el precio de esa tienda. `vendorAliases` unifica marcas
  («MELO Alimentos» → «Melo»).
- **Feed** (`connectors/feed.js`): para tiendas socias que comparten su inventario en CSV/JSON con
  las columnas `sku,gtin,nombre,marca,categoria,presentacion,precio,precio_regular,disponible,url,imagen`
  (ejemplo en `data/feeds/minisuper-ejemplo.csv`).

Cuidados que tienen los bots:
- Se identifican como `MercaptyBot` y esperan 1.5 s entre peticiones.
- Si una tienda no responde o devuelve 0 productos, no se toca lo guardado.
- Si llegan muchos menos productos que la vez anterior, no se marca nada como agotado.
- Un recorrido completo tarda cerca de una hora (Super Carnes unos 24 minutos, Super Xtra 8 y El Machetazo 6,
  porque se leen completos) y corre dos veces al día. El repositorio es público, así que los minutos de GitHub Actions no
  tienen límite. Si vuelve a ser privado (2 000 minutos gratis al mes), hay que dejar una sola corrida
  (`cron: '17 10 * * *'`) y apagar la de Súper 99, que por sí sola usa unas 5 horas cada noche.

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

**Animación de carga** (`public/loader.svg`): el cerdito del logo corre tras un billete con alas mientras carga
una página (al abrir la web, y al cambiar de página si tarda más de un tercio de segundo). Es un solo SVG con
sus movimientos en CSS, sin librerías, y se queda quieto si el equipo pide menos movimiento. Cada parte
(cuerpo, patas, cola, oreja, billete, alas, piso) es un grupo con su clase; la app la rehace igual en
`mobile/src/components/piggy-loader.tsx`.

### App para iPhone y Android (`mobile/`)

App nativa hecha con **Expo** (React Native, SDK 57). Lee la misma API de la web
(`https://mercapty.com/api/...`): no tiene base de datos ni bots propios.

- **Arranque:** el splash nativo muestra el cerdito de `loader.svg` quieto en el centro. Al abrir, la app dibuja
  encima el mismo cerdito, que empieza a correr mientras cargan la fuente, «Mi lista» y los precios de la portada
  (se ve al menos 1.6 s y no espera más de 4 s por la red). `piggy-loader.tsx` rehace cada parte del SVG con sus
  mismos keyframes, pivotes y tiempos (animaciones CSS de Reanimated); también es la carga de cada pantalla.
- **Bienvenida («Get started»):** solo la primera vez. Tres páginas que se deslizan: el precio más bajo (con
  ofertas reales de `/api/deals`), la canasta y el cerdito alcancía con los logos de los súper. «Saltar» o
  «Empezar a ahorrar» la cierran; «Ver la bienvenida otra vez», al final de Tiendas, la vuelve a mostrar.
- **Pestañas nativas:** Inicio, Buscar, Mi lista (con la cantidad de productos) y Tiendas; la ficha de producto se
  abre encima y se puede compartir con su dirección de la web. «Comprar en…» pasa por `/go/:id` (cuenta la
  visita) y abre la tienda en el navegador dentro de la app.
- **Mi lista** se guarda en el teléfono (AsyncStorage), con la misma forma que en la web.
- **Escanear** (botón de código de barras en Inicio y en Buscar, `src/app/escanear.tsx`): la cámara lee EAN, UPC
  y QR con un enlace de Mercapty. Si el código es de un solo producto abre su ficha; si hay varias presentaciones
  (unidad y paquete), la búsqueda. Usa la búsqueda por código de la API y funciona en Expo Go.
- Íconos y splash (`mobile/assets/images/`) salen de `public/icon.svg` y `public/loader.svg`.

Probarla en tu celular, sin emulador:

1. Instala **Expo Go** (App Store o Google Play).
2. En `mobile/`: `npm install` y después `npx expo start`.
3. Escanea el código QR con la cámara (iPhone) o con Expo Go (Android). El celular y la computadora deben estar
   en la misma red Wi-Fi; si no, `npx expo start --tunnel`.

Usa la API de producción; para probar otra: `EXPO_PUBLIC_API_URL=<dirección> npx expo start`. Revisión de
tipos: `npx tsc --noEmit`. En Expo Go no aparece el splash nativo (sí el cerdito animado): se ve en una
compilación de verdad.

**Publicar en App Store y Google Play:** con EAS (`npm i -g eas-cli`, luego `eas build`), que también compila la
versión de iPhone sin Mac. Antes, confirma `ios.bundleIdentifier` y `android.package` en `mobile/app.json` (hoy
`com.mercapty.app`): no se pueden cambiar después de publicar. AdSense no funciona dentro de una app; ahí se usa AdMob.

## Contacto y redes

WhatsApp, correo, Instagram y Facebook se configuran en un solo lugar, `server/contact.js`, y llegan por
`/api/meta` a la web (columna «Contacto» del pie de página y botones «Escríbenos» en Tiendas, para los
supermercados) y a la app (final de Tiendas), sin publicar otra versión de la app. Un campo vacío no se muestra.
El correo también está escrito en `public/privacidad.html`: si cambia, cámbialo en los dos.

## Idiomas (español e inglés)

La web y la app se pueden usar en español o en inglés. En el código los textos van en español y `t()` los cambia por
su traducción: la web en `public/js/i18n.js` y la app en `mobile/src/lib/i18n.tsx`. Si falta una traducción, se ve el
español. Para un texto nuevo, escríbelo con `t('…')` y agrega su traducción al diccionario `EN` del mismo archivo.

- **Web:** botón «EN / ES» arriba (en el celular, junto al logo) y enlace «English / Español» en el pie de página. La
  elección se guarda en el navegador; la primera vez se usa el idioma del navegador. Cambiar de idioma recarga la
  página. La política de privacidad tiene su versión en inglés en la misma página. El panel de imágenes (`/admin`)
  queda en español.
- **App:** «EN» junto a «Saltar» en la bienvenida e «Idioma · Language» al final de Tiendas. El cambio es inmediato y
  se guarda en el teléfono; la primera vez se usa el idioma del teléfono.
- Los nombres de los productos quedan como los publica cada tienda (en español). Para quien busca en inglés, el
  servidor entiende las palabras más comunes del súper («milk» → leche, «eggs» → huevos, «toilet paper» → papel
  higiénico): lista `ENGLISH` en `server/api.js`.
- Google indexa la web en español: las direcciones son las mismas en los dos idiomas.

## Anuncios (Google AdSense)

Los espacios ya están colocados en la portada, la búsqueda y la ficha de producto. En tu computadora se
ven como recuadros punteados; en la web no aparecen hasta que configures AdSense.

1. Compra el dominio y conéctalo en Vercel (**Settings** → **Domains**).
2. La política de privacidad (`public/privacidad.html`) ya tiene el correo de contacto: AdSense exige esa página.
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
- El sitio vive en `mercapty.com`: en Vercel hay que definir `SITE_URL=https://mercapty.com` para que las
  direcciones canónicas y el mapa del sitio usen el dominio propio y Google no lo mezcle con la dirección
  de vercel.app. Registra el sitio y el sitemap en
  [Google Search Console](https://search.google.com/search-console).

## Antes de crecer

- **Precios exactos:** se muestra la fecha de actualización y se aclara que el precio final lo
  confirma la tienda (Ley 45 de 2007 de protección al consumidor).
- **Datos personales:** la lista se guarda solo en el navegador. Si agregas cuentas o alertas,
  aplica la Ley 81 de 2019.
- **Envío:** los totales no incluyen envío; agregar tarifa y mínimo de cada tienda mejora «Mi lista».

## Próximos pasos

1. Súper 99: un acuerdo o un feed daría los precios de todo su catálogo cada día, sin leer página por página.
2. Revisión de coincidencias entre tiendas para productos sin código de barras.
3. Alertas de baja de precio y escaneo de código de barras con la cámara.
4. Acuerdos con tiendas (feed o afiliados).

## Estructura

```
api/index.js    función de Vercel (usa server/app.js)
connectors/     bots: vtex.js, woocommerce.js, instaleap.js, ribasmith.js, magento.js, shopify.js, super99.js, feed.js
scripts/        ingest.js: corre los bots y guarda en la base · super99.js: bot de Súper 99 · lib/pipeline.js
server/         app.js (rutas), api.js (consultas), db.js (Turso/SQLite), storage.js (fotos), index.js (local), contact.js (contacto)
public/         shell.html (la plantilla que rellena el servidor), styles.css, js/ (app.js, i18n.js, images.js, views/)
mobile/         app de Expo: src/app (pantallas), src/components (cerdito, tarjetas…), src/lib (API, lista)
data/           stores.json, feeds/   · generados (fuera de git): mercapty.db, images/, admin-key.txt
.github/        workflows/precios.yml: bots dos veces al día · super99.yml: Súper 99 cada noche
```
