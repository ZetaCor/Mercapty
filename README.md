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

**Licores:** tienen su propia categoría, separada de Bebidas, y **no salen en la vitrina de la portada ni en
la bienvenida de la app**. Son caros, así que sus diferencias entre tiendas son de $20 a $70 y ganaban siempre
el ranking del ahorro: un comparador de canasta básica abría con tres botellas de whisky. Se reconocen por la
sección de la tienda («Licor, Cerveza y Vino» en Xtra, «Licores» en Rey), por el nombre (ron, cerveza, vino,
cabernet, brut…) y por una lista corta de marcas que no dicen qué son, como Chivas o Buchanan. Se siguen
buscando y comparando igual que todo lo demás.

**Comparaciones malas:** algunas tiendas publican la caja o el paquete de varias unidades con el código de
barras de la unidad suelta, y sin defensa aparecen «ahorros» de $14.56 en una lata de soda de $0.56. Una oferta
que cuesta más de 2,5 veces la más barata (y al menos $1.50 más) se aparta de la comparación:
no cuenta para el ahorro, ni para el «en N tiendas», ni para los avisos, y en la ficha del producto sale
marcada como «Otra presentación», con su precio a la vista pero sin compararlo. La regla está en
`server/lib/compare.js` y se aplica una sola vez, al armar `product_best`, así que vale igual para la web y para
la app.

**Buscar por código de barras:** una búsqueda de solo dígitos (el escáner de la app, o alguien que teclea el
código) se resuelve por el código exacto, rellenando con ceros hasta 14, no por palabras: el índice de texto
busca palabras completas y nunca encontraría `12157901260` dentro de `00012157901260`.

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

**Días de descuento:** los súper anuncian días fijos («Martes de frutas y vegetales») y fechas sueltas (Black
Friday). Como ninguno los publica en un formato que un bot pueda leer, se escriben a mano en `data/promos.json`:
de qué tienda es, el descuento, los días (`weekdays`), el rango de fechas (`from` y `to`), a qué categorías aplica,
unas `keywords` del nombre si hay que afinar dentro de una categoría (los cosméticos y la dermocosmética comparten
«Cuidado personal»), y `terms` con la condición que pone la tienda («Con el Programa 99+»), que sale a la vista.
Los días y las fechas se combinan: un día de descuento casi siempre viene con fecha de vencimiento, y al pasarse
deja de mostrarse solo. Con `enabled` en `false` no se muestra a nadie: así no se anuncia un descuento sin
confirmar. `/api/promos` devuelve las de hoy según la hora de Panamá (no la del servidor), la portada las muestra
en una franja y cada producto al que le aplica lleva «Hoy −20% en …».

Los de Súper 99 salen de su [Programa 99+](https://www.super99.com/programa-99) (confirmados el 17-09-2026):
martes 20% en frutas y vegetales, miércoles 20% en mascotas, viernes 25% en cosméticos y 30% en dermocosmética.
**Vencen el 30-09-2026**; cuando Súper 99 publique los del trimestre siguiente hay que actualizar las fechas, que
si no, la franja desaparece sola. Los de «todos los días» (25% en medicamentos, 30% en Toyland) están apagados:
una franja fija todos los días cansa y los bots casi no traen farmacia ni juguetería.

**Paquetes:** «946 ml (Pack de 12)», «6 pack», «Caja de 24» o «6 x 355 ml» se reconocen como
paquetes. Un paquete nunca se une con la unidad, aunque la tienda use el mismo código de barras, y
su precio por litro o por kilo se calcula sobre el total. Los códigos internos de productos pesados
(prefijos 2, 02 y 04) se descartan porque cada tienda inventa los suyos. También se descartan los códigos
cuyo dígito verificador no cuadra (SKU internos que parecen códigos de barras).

**Emparejamiento por modelo** (`modelCode` en `server/lib/matching.js`): los electrodomésticos no traen
código de barras, pero sí número de modelo, y «Whirlpool WP3040S» es la misma estufa en las tres tiendas
aunque cada una la nombre distinto. Un modelo es una palabra de cinco o más con letras y números mezclados;
se descarta lo que lo parece y no lo es: clases de wifi (AC1200, AX5400), voltajes (100-240V), medidas
(12000BTU) y español pegado a un número («3Velocidades»), que siempre trae una racha larga de letras. El
modelo no basta por sí solo: los nombres además tienen que parecerse y la capacidad coincidir, porque el
mismo «Kingston XS1000» viene de 1 TB y de 2 TB. Con esto las comparaciones de electrodomésticos pasaron de
8 a 227.

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

## Tiendas (septiembre 2026)

| Súper | Plataforma | Estado |
|---|---|---|
| Super Xtra | VTEX | ✅ Bot activo: recorre **sus 12 departamentos completos** (API pública de catálogo), no solo los de súper |
| El Machetazo | VTEX | ✅ Bot activo: recorre **sus 11 departamentos completos** (API pública de catálogo): súper, farmacia, tecnología, hogar, ferretería, juguetería, deportes, escolar, sedería y fiestas |
| Superunico | WooCommerce | ✅ Bot activo (Store API pública) |
| Súper 99 | Magento | ✅ Bot propio: lee sus páginas de producto una por una (traen código de barras). La cola se reparte en **tres turnos en paralelo**: unas 15 000 páginas cada noche, una vuelta completa al catálogo en tres noches |
| Riba Smith | Next.js | ✅ Bot activo: busca los términos de canasta básica en su web, ahora hasta 30 páginas por término. Publica el código de barras sin el dígito verificador: se completa; lo que no tiene código se une por nombre, tamaño y marca |
| Supermercados Rey | Instaleap | ✅ Bot activo: **recorre su árbol de categorías completo** (`getCategory` + `getProductsByCategory`, 100 productos por página) |
| Metro Plus | Tipti | ⏳ Vende en línea por Tipti, cuya API exige iniciar sesión: hace falta un acuerdo o un feed |
| PriceSmart | Nuxt + Bloomreach | ⛔ Su robots.txt bloquea expresamente a los bots que copian datos: solo con acuerdo o feed |
| Super Kosher | Self-Point | ⛔ Su robots.txt lo permite, pero Cloudflare bloquea a los bots en su API de productos: solo con acuerdo o feed |
| Super Carnes | Magento | ✅ Bot activo: lee sus 529 subcategorías de súper (hasta 160 productos por página, con código de barras): unos 3 800 productos en ~24 min |
| Alimentos Melo | Shopify | ✅ Bot activo: su catálogo público de Shopify (unos 80 productos de pollo, cerdo, embutidos, jugos…) en una consulta. Sin código de barras: se une por nombre, marca y tamaño |
| Super Barú | Shopify | ✅ Bot activo: su catálogo público de Shopify (unos 7 200 productos). Sin código de barras: se une por nombre, marca y tamaño |
| El Fuerte | Shopify | ✅ Bot activo: su catálogo público de Shopify (unos 11 500 productos). Sus cajones propios («ELECTRO», «COLCHONES», «DAMAS») se traducen con `categoryMap` |
| Arrocha | Shopify | ✅ Bot activo: **18 800 productos**, la farmacia y el cuidado personal que faltaban. Dejó Magento y ahora publica su catálogo en Shopify, así que se lee con el mismo bot que Melo. Sin código de barras: se une por nombre, marca y tamaño |
| Mr Precio | WordPress | ⛔ No vende en línea: su web solo tiene sucursales y un PDF de ofertas (es del Grupo Rey) |
| Foodie Market | Wix | ⛔ No vende en línea: su web es informativa (sucursales, jugos, recetas) y no tiene tienda ni precios; su mapa del sitio son siete páginas y ninguna es de producto. Haría falta un feed suyo |

**Cobertura: todo el catálogo, no una muestra.** Un comparador que no tiene el producto que la persona busca no
sirve, así que cada bot recorre el catálogo entero de su tienda y no una selección. Antes no era así y se notaba:
Rey buscaba 101 términos y se quedaba con las primeras 4 páginas de cada uno —de los 1.150 productos que publica
para «pollo» tomaba 200, un 29 % de lo que hay—, y de El Machetazo solo se leían 2 de sus 12 departamentos. Ahora
Rey se recorre por su árbol de categorías y las dos tiendas VTEX por todos sus departamentos. La contrapartida es
que una corrida tarda más; con el repositorio público los minutos de GitHub Actions no se cobran.

**Electrodomésticos y electrónica.** Es la primera categoría que no es de súper. Se compara entre tres
tiendas que venden lo mismo; sin al menos dos no hay nada que comparar y la categoría no valdría la pena.

| Tienda | Plataforma | Estado |
|---|---|---|
| Panafoto | Magento | ✅ Bot activo por su API de catálogo (`/graphql`): línea blanca, electrodomésticos, TV, audio, celulares y cómputo, unos 3 400 productos |
| Multimax | Shopify | ✅ Bot activo (catálogo público de Shopify), unos 2 900 productos con marca |
| Rodelag | Shopify | ✅ Bot activo (catálogo público de Shopify), unos 3 400 productos con marca |
| Do It Center | Magento | ⛔ Su robots.txt autoriza `/graphql` y el catálogo se lee bien, pero su CDN responde 403 a todo bot que se identifique y solo deja pasar a quien se hace pasar por navegador. No se disfraza el bot: hace falta pedirles permiso o un feed |
| Novey | Magento | ⛔ Igual que Do It Center: 403 al bot identificado |
| Sysco Panamá | Magento | ⛔ Vende al por mayor a restaurantes: su catálogo se ve, pero los precios llegan vacíos si no se inicia sesión. Sin precio no hay comparación |

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

**Cada tienda corre en su propio trabajo, en paralelo** (`.github/workflows/precios.yml`). Al principio iban
todas seguidas en uno solo y, desde que recorren el catálogo completo, dejaron de caber: las corridas se
cancelaban a los 90 minutos sin terminar y no entraba nada nuevo. Ahora un primer trabajo lee
`data/stores.json` (`node scripts/tiendas.js`) y monta un trabajo por tienda, de cuatro en cuatro; si una
tienda falla o bloquea al bot, las demás acaban igual. El resumen que usa la web se rehace una sola vez al
final, con `npm run resumen`, cuando ya están todas: por eso los bots lo saltan con `INGEST_SIN_RESUMEN=1`.

- **VTEX** (`connectors/vtex.js`): con `"mode": "categories"` recorre completos, con la API pública de
  catálogo, los departamentos de `departments` (`{ "id", "name" }`). Así no se escapa ningún producto
  (antes faltaban el ron Flor de Caña o la Coca-Cola normal porque ninguna palabra los buscaba). VTEX no
  pagina más allá de 2 500 productos por consulta: si un departamento tiene más, se parte por rangos de
  precio. Solo se leen productos con precio desde $0.01: VTEX pone precio 0 a lo agotado (en el súper de
  Super Xtra son casi 2 900). Super Xtra y El Machetazo se recorren enteros, con todos sus departamentos (súper, farmacia,
  tecnología, hogar, ferretería, juguetería, deportes y escolar).
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
  (`.github/workflows/super99.yml`, 10:07 p. m.). **La cola se reparte en tres turnos que corren a la vez**
  (`SUPER99_PARTES` y `SUPER99_PARTE`: cada uno toma una de cada tres páginas, respetando el orden), y cada
  turno lee lo que alcanza en ~5 h 20 min (unas 5 000 páginas): unas 15 000 por noche entre los tres, y la
  noche siguiente siguen donde quedaron. Así la primera vuelta al catálogo toma tres noches en vez de ocho,
  que es lo que hacía que al escanear un código en el súper el producto a veces no apareciera. Aun repartido,
  su web recibe menos de una página por segundo entre los tres turnos. Orden: primero relee a diario los
  productos que también venden otras tiendas (los que sirven para comparar), luego los que aún no conoce y
  después el resto, del que lleva más tiempo sin leerse.
  La tabla `store_pages` guarda cuándo se leyó cada página y qué se encontró. Solo guarda productos de sus
  departamentos de súper (`departments` en `data/stores.json`); farmacia, ferretería o juguetería se saltan.
  Un precio que no se relee en 14 días deja de mostrarse. Como los turnos corren a la vez, el resumen que usa
  la web lo rehace un trabajo aparte cuando los tres acaban (`npm run resumen`): por eso los turnos lo saltan
  con `SUPER99_SIN_RESUMEN=1`. Prueba corta: `SUPER99_MINUTES=2 npm run super99`.
- **Magento por categorías** (`connectors/magento.js`): Super Carnes. Sus páginas de categoría traen hasta 160
  productos con nombre, precio, precio anterior, foto y código de barras (su SKU, que también va al final de
  la dirección del producto). Sus categorías cargan más productos al bajar (no hay páginas `?p=2`), así que se
  leen las subcategorías finales de sus departamentos de súper (`departments`), que su mapa del sitio lista y
  que caben en una página. Su API interna (GraphQL) responde 403 a los bots, así que no se usa.
- **Shopify** (`connectors/shopify.js`): Alimentos Melo, Super Barú, El Fuerte, Arrocha, Multimax y Rodelag.
  Toda tienda Shopify publica su catálogo en
  `/products.json` (hasta 250 productos por página): nombre, marca, tipo, presentación, precio, precio anterior,
  existencias y foto. No trae el código de barras, así que estos productos se unen por nombre, marca y tamaño;
  los que no dicen su tamaño aparecen solo con el precio de esa tienda. `vendorAliases` unifica marcas
  («MELO Alimentos» → «Melo») y `categoryMap` traduce los cajones propios de cada tienda a nuestras categorías
  («Dermocosmética» y «Hair Care» de Arrocha → Cuidado personal; «ELECTRO» de El Fuerte → Electrodomésticos).
  Es el bot más barato de sumar: una tienda nueva de Shopify no necesita código, solo su ficha en
  `data/stores.json`.
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
  (`cron: '17 10 * * *'`) y apagar la de Súper 99, que por sí sola usa unas 16 horas cada noche (tres turnos
  de cinco); para dejarla en una sola, basta con poner `parte: [0]` y `SUPER99_PARTES: 1` en su workflow.

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

**El cerdito que saluda** (`public/piggy-hello.svg`): el mismo del logo, de pie, con una moneda de oro en una
mano y saludando con la otra. Abre la portada de la app, junto al «Hola, buenos días», y sale en la pantalla del
teléfono que enseña la página `/app`. Misma técnica que la animación de carga: un SVG con el saludo en CSS,
rehecho para la app en `mobile/src/components/piggy-hello.tsx`.

**El teléfono de la portada y de `/app`** (`phoneVisual` en `public/js/views/hero.js`) enseña la app de verdad:
el mismo saludo con el cerdito, las mismas tarjetas de precio y las mismas pestañas. Está dibujado con HTML y no
es una captura, así que se ve nítido en cualquier pantalla, no pesa nada y habla los dos idiomas. Si cambia la
app, hay que cambiarlo aquí también.

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
- **Portada:** el cerdito del logo saluda con una moneda en la mano y, según la hora, dice «Hola, buenos días»,
  «Hola, buenas tardes» o «Hola, buenas noches», en vez del discurso de venta de la web, que sobra en una app que
  ya se instaló. A la derecha del saludo hay un sol de 6 de la mañana a 6 de la tarde y una luna el resto del día
  (de madrugada también, que es cuando saluda con «buenas noches»). Si hoy hay día de descuento, su franja va
  antes del saludo: es lo que hay que ver ese día.
- **Pestañas nativas:** Inicio, Buscar, Mi lista (con la cantidad de productos) y Tiendas; la ficha de producto se
  abre encima y se puede compartir con su dirección de la web. «Comprar en…» pasa por `/go/:id` (cuenta la
  visita) y abre la tienda en el navegador dentro de la app.
- **Mi lista** se guarda en el teléfono (AsyncStorage), con la misma forma que en la web.
- **Juego** (`src/app/(tabs)/juego.tsx`): «tiro al chanchito». El cerdito del logo cruza la cancha con su
  moneda; se arrastra el dedo hacia abajo para tensar la flecha y se suelta para dispararla, en dirección
  contraria al arrastre y con su peso encima, así que hay que adelantarse al blanco. **La meta son 100 aciertos
  y quien llega se gana un producto** de las tiendas que comparamos: sale su foto, su tienda y su precio, y un
  botón que abre WhatsApp con el mensaje ya escrito para reclamarlo (el producto se saca al azar de las ofertas
  de `/api/deals`, que ya vienen cargadas). Se empieza con cinco flechas y **solo se pierde flecha cuando el tiro
  falla**: si acierta, no se resta, así que la ronda dura lo que dure la puntería. Cada diez aciertos el cerdito
  corre más rápido (de 120 a 300 píxeles por segundo en la meta) y cada cinco tiros entra un anuncio de pantalla
  completa. El récord se guarda en el teléfono. La fuerza del tiro se calcula
  con el tamaño de la cancha (con el 45 % del estirón la flecha llega justo a la altura del cerdito), para que se
  sienta igual en un teléfono grande y en uno chico. Está hecho solo con `Animated` y `PanResponder` de React
  Native más el SVG del logo: no agrega código nativo, así que viaja como una actualización normal. Las cuentas
  van en un ref y se empujan a los valores animados cuadro a cuadro; React no se redibuja mientras la flecha
  vuela, y el bucle se detiene al salir de la pestaña.
  - **Cuánto esquiva el cerdito es lo que decide si el premio se puede ganar.** Con cinco flechas solo se pueden
    fallar cuatro tiros en toda la partida, así que `ESQUIVA_MIN` y `ESQUIVA_MAX` (2 % al empezar, 6 % en la meta)
    tienen que quedarse en números chicos: a quien apunte siempre bien, el cerdito le quita unas cuatro flechas en
    el camino a los 100, y así llega a la meta en unas seis de cada diez partidas. Si suben mucho, el premio se
    vuelve imposible de ganar; si bajan a cero, lo gana cualquiera. La dificultad de verdad es la puntería, porque
    al final el cerdito corre a más del doble. Una partida completa son unos 95 tiros, o sea unos 19 anuncios.
- **Escanear** (botón de código de barras en Inicio y en Buscar, `src/app/escanear.tsx`): la cámara lee EAN, UPC
  y QR con un enlace de Mercapty. Si el código es de un solo producto abre su ficha; si hay varias presentaciones
  (unidad y paquete), la búsqueda. Usa la búsqueda por código de la API y funciona en Expo Go.
- **Actualizaciones:** al abrir la app, y al volver a ella, busca si hay una versión nueva del código. La
  descarga sola y abajo aparece «Hay una versión nueva · Actualizar»; si no se toca, entra sola la próxima vez
  que se abra. En Tiendas se ve la versión instalada y hay un botón para buscarla a mano
  (`src/components/app-updates.tsx`). Lo maneja `expo-updates` con EAS Update, así que solo funciona en la app
  compilada, no en Expo Go.
- **Avisos (notificaciones):** en Ajustes se activan y se elige qué recibir: cuando baja de precio algo de «Mi
  lista», el día de descuento de un súper, o las ofertas del día (esta última apagada). El teléfono se guarda en la
  tabla `devices` con su token de Expo, lo que quiere recibir y los ids de su lista; no hay cuentas ni datos
  personales, y al apagar todos los avisos se borra la fila. Los envía `scripts/notify.js` por el servicio de Expo:
  `lista` al final de cada corrida de los bots (lo que bajó queda anotado en `price_drops` al recalcular el resumen y
  se avisa una sola vez), y `promos` y `ofertas` cada mañana (`.github/workflows/avisos.yml`). Para probar sin enviar
  nada: `NOTIFY_DRY=1 npm run notify -- lista`. En Android hace falta subir a EAS una clave de servicio de Firebase
  (FCM V1) y tener `google-services.json` en `mobile/`.
- **El permiso se pide solo**, dos segundos después de abrir la app por primera vez (ya pasada la bienvenida), que
  es cuando se entiende para qué sirve. Se pregunta una sola vez: si dice que no, no se insiste. Desde Ajustes se
  puede volver a intentar, y cuando el teléfono ya no deja preguntar (Android deja de hacerlo tras dos negativas),
  el botón abre directo los permisos de Mercapty. Al volver a la app se revisa el permiso otra vez, así que los
  avisos quedan encendidos sin tocar nada más.
- **Para probar que llegan:** `npm run notify -- prueba` manda un aviso de prueba a todos los teléfonos
  registrados, sin mirar preferencias. Desde GitHub: Actions → «Avisos de la mañana» → *Run workflow*, y ahí se
  elige cuál mandar.
- **Los avisos necesitan una compilación nueva, no una actualización.** `expo-notifications` es código nativo: una
  app ya instalada no lo tiene y no lo puede descargar. Por eso, al añadirlos, la versión de `mobile/app.json` sube
  a 1.1.0: como `runtimeVersion` sigue a la versión, las actualizaciones nuevas ya no le llegan a la app 1.0.0 (que
  se rompería al abrirlas) y sí a la que se compile a partir de ahora. Siempre que se agregue una librería nativa,
  hay que subir la versión antes de publicar la actualización.
- Íconos y splash (`mobile/assets/images/`) salen de `public/icon.svg` y `public/loader.svg`.

Probarla en tu celular, sin emulador:

1. Instala **Expo Go** (App Store o Google Play).
2. En `mobile/`: `npm install` y después `npx expo start`.
3. Escanea el código QR con la cámara (iPhone) o con Expo Go (Android). El celular y la computadora deben estar
   en la misma red Wi-Fi; si no, `npx expo start --tunnel`.

Usa la API de producción; para probar otra: `EXPO_PUBLIC_API_URL=<dirección> npx expo start`. Revisión de
tipos: `npx tsc --noEmit`. En Expo Go no aparece el splash nativo (sí el cerdito animado) ni salen los anuncios
de AdMob (`src/lib/ads.tsx` se da cuenta de que no está el módulo nativo y la app sigue sin ellos): las dos
cosas se ven en una compilación de verdad.

**Publicar en Google Play y App Store**, con EAS, que también compila la versión de iPhone sin tener Mac:

1. `npm i -g eas-cli` y `eas login` (cuenta de Expo, gratis).
2. En `mobile/`: `eas update:configure`. Agrega a `app.json` el `runtimeVersion`, la dirección de las
   actualizaciones y el id del proyecto; sin eso, el aviso de versión nueva no tiene de dónde bajarlas.
3. `eas build --platform android --profile production` deja un `.aab` para Google Play (para iPhone,
   `--platform ios`).
4. Subirlo en Play Console (cuenta de desarrollador, pago único) con la ficha de la tienda: nombre,
   descripción, capturas, ícono y la política de privacidad (`https://mercapty.com/privacidad.html`).
5. Después, cada cambio que sea solo de código se publica con `eas update --branch production` y les llega a
   los usuarios sin pasar por la tienda. Si cambia algo nativo (un permiso, una librería con código nativo, la
   versión del SDK), hay que compilar y subir una versión nueva.

Antes de publicar, confirma `ios.bundleIdentifier` y `android.package` en `mobile/app.json` (hoy
`com.mercapty.app`): no se pueden cambiar después de publicar. AdSense no funciona dentro de una app; ahí se usa
AdMob, que ya está puesto: [Anuncios en la app](#anuncios-en-la-app-google-admob).

## Contacto y redes

WhatsApp, correo, Instagram y Facebook se configuran en un solo lugar, `server/contact.js`, y llegan por
`/api/meta` a la web (columna «Contacto» del pie de página y botones «Escríbenos» en Tiendas, para los
supermercados) y a la app (final de Tiendas, y el botón para reclamar el premio del juego), sin publicar otra
versión de la app. Un campo vacío no se muestra. El correo también está escrito en `public/privacidad.html`: si
cambia, cámbialo en los dos.

Cada canal se escribe de la forma más corta que funcione: el correo y el WhatsApp son el dato pelado, Instagram
es el usuario sin `@` (`mercapty01`) y de ahí sale su dirección. Facebook comparte la página con un enlace corto
que no lleva el nombre dentro (`facebook.com/share/…`), así que ese va como `{ text, url }`: el enlace entero y,
aparte, el nombre que se ve. Cualquiera de los dos acepta las dos formas.

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

## Anuncios en la web (Google AdSense)

Los espacios ya están colocados en la portada, la búsqueda y la ficha de producto, cada uno con su etiqueta
«Publicidad». En tu computadora se ven como recuadros punteados; en la web no aparece nada —ni el script de
Google— hasta que configures `ADSENSE_CLIENT`. Cuando lo configuras, el servidor entrega en la cabecera la
etiqueta `google-adsense-account` y el script de AdSense: tienen que venir en el HTML, porque el revisor de
Google y su robot no ejecutan el JavaScript de la página.

1. Compra el dominio y conéctalo en Vercel (**Settings** → **Domains**).
2. La política de privacidad (`public/privacidad.html`) ya tiene el correo de contacto: AdSense exige esa página.
3. Solicita AdSense con tu dominio. Cuando te aprueben, en Vercel → **Environment Variables** agrega
   `ADSENSE_CLIENT` con tu ID (`ca-pub-…`) y haz **Redeploy**. Con eso se carga el script de AdSense y
   `/ads.txt` se genera solo.
4. Opcional: crea bloques de anuncios en AdSense y agrega sus números en `ADSENSE_SLOT_HOME`,
   `ADSENSE_SLOT_SEARCH` y `ADSENSE_SLOT_PRODUCT`. Sin bloques, puedes usar los anuncios automáticos de AdSense.
5. En AdSense → **Privacidad y mensajes**, activa el mensaje de consentimiento (GDPR). Hace falta si alguien de
   Europa abre la web, y se configura desde su panel: no lleva código.

**Sobre la aprobación.** Google rechaza sitios que son solo datos de otros («contenido de poco valor»), así que
no está garantizada. A favor juegan las páginas con texto propio (portada, tiendas, app, privacidad) y que cada
ficha de producto compara precios entre tiendas y enseña su historial, que es trabajo propio y no una copia. Si
llega un rechazo, el camino conocido es sumar contenido que solo Mercapty pueda escribir —el súper más barato de
la semana, el índice de la canasta básica— y volver a pedirlo.

## Anuncios en la app (Google AdMob)

AdSense no funciona dentro de una app: ahí se usa **AdMob**, que es de Google también pero con su propio panel,
sus propios identificadores y su propio pago. En la app hay dos clases de anuncio:

- **Franja (banner)** abajo de Inicio, dentro de los resultados de Buscar, en la ficha de producto y debajo de la
  cancha del juego. Si Google no manda ninguno, la franja no deja hueco: el espacio desaparece.
- **Pantalla completa (intersticial)** en el juego, **cada cinco tiros**. Entra entre tiro y tiro, nunca encima
  del cartel del premio, y mientras se ve uno ya se va cargando el siguiente.

Todo vive en `mobile/src/lib/ads.tsx` (y `ads.web.tsx`, que no muestra nada porque la versión web del proyecto usa
AdSense). **Mientras no pongas tus identificadores, la app usa los de prueba de Google**: se ven anuncios de
mentira que dicen «Test Ad», sirven para revisar el diseño y no ponen en riesgo la cuenta.

### Cómo sacar tus identificadores, paso a paso

1. Entra en [admob.google.com](https://admob.google.com) con la misma cuenta de Google de AdSense y acepta las
   condiciones. AdMob va por debajo de AdSense: si AdSense aún no está aprobado, puedes crear la cuenta igual,
   pero no cobrarás hasta que lo esté.
2. **Apps** → **Agregar app**. Te pregunta si ya está publicada: si todavía no está en Google Play, di que no y
   ponle el nombre `Mercapty`. Hazlo **dos veces**, una para Android y otra para iOS: son dos apps distintas para
   AdMob aunque para ti sea la misma.
3. Anota el **ID de app** de cada una. Tiene una virgulilla: `ca-app-pub-0000000000000000~1111111111`.
4. En cada app: **Bloques de anuncios** → **Agregar bloque** → **Banner**, ponle `Franja Mercapty`. Repite con
   **Intersticial**, `Pantalla completa juego`. Son cuatro bloques en total (dos por plataforma).
5. Anota el **ID de cada bloque**. Ese lleva barra, no virgulilla: `ca-app-pub-0000000000000000/2222222222`.
6. Pega los seis números en `mobile/app.json`, sin inventar nada: los de la virgulilla en el bloque del plugin
   `react-native-google-mobile-ads` (hoy están los de ejemplo de Google) y los de la barra en `extra.admob`:

   ```json
   "extra": {
     "admob": {
       "android": { "banner": "ca-app-pub-…/…", "interstitial": "ca-app-pub-…/…" },
       "ios":     { "banner": "ca-app-pub-…/…", "interstitial": "ca-app-pub-…/…" }
     }
   }
   ```

7. **Hay que compilar de nuevo**, no basta con `eas update`: AdMob trae código nativo y los ID de app se escriben
   dentro del paquete. Por eso `mobile/app.json` sube a **1.2.0** al añadirlo (ver más arriba: una app ya instalada
   no puede descargar código nativo nuevo). Después de compilar y subir, las actualizaciones normales sí pueden
   cambiar dónde va cada anuncio, porque eso es solo código.
8. En Vercel → **Environment Variables**, agrega `ADMOB_CLIENT` con tu número `pub-…` y haz **Redeploy**. Con eso
   `https://mercapty.com/app-ads.txt` se genera solo. Ese archivo es el que mira quien compra publicidad para
   comprobar que los espacios son de verdad tuyos; sin él se paga mucho menos. Si tu AdMob usa el mismo `pub-…`
   que AdSense, basta con tener ya `ADSENSE_CLIENT` y no hace falta la variable nueva. En AdMob → **Configuración
   de la app** → **app-ads.txt** te dice qué línea espera y si ya la encontró (tarda días en revisarla).
9. Para cobrar, en AdMob → **Pagos**: dirección en Panamá, datos de impuestos y cuenta. Google manda un PIN por
   correo postal al llegar a 10 USD y paga a partir de 100 USD.

### Cosas que conviene saber

- **No toques tus propios anuncios.** Un par de clics tuyos en la app publicada basta para que Google cierre la
  cuenta. Para probar están los ID de prueba, que es justo lo que hay puesto ahora.
- **En Expo Go no salen**, porque AdMob es código nativo y Expo Go no lo trae. `ads.tsx` se da cuenta y la app
  funciona igual, sin anuncios. Para verlos: `npx expo run:android` o una compilación de EAS.
- **Consentimiento (Europa).** Al arrancar, la app llama a `AdsConsent.gatherConsent()`: en Europa muestra el
  cartel que exige la ley y en Panamá no pregunta nada. El texto del cartel se configura en AdMob → **Privacidad
  y mensajes**, igual que en la web, y no lleva código.
- **iPhone.** Apple pide el permiso de seguimiento (App Tracking Transparency) si quieres anuncios personalizados.
  Sin él los anuncios igual salen, solo que sin personalizar y pagando algo menos. Si algún día lo quieres:
  `npx expo install expo-tracking-transparency`, agrégalo a `plugins` con su texto de permiso y pide el permiso
  antes de `iniciarAnuncios()`.
- Los anuncios están limitados a contenido apto para todo público (`MaxAdContentRating.PG`).
- **Cada cinco tiros puede ser mucho.** Como acertar no gasta flecha, una buena partida son más de cien tiros, o
  sea más de veinte anuncios seguidos. Google mira que no se abuse del anuncio de pantalla completa y, si le
  parece demasiado, deja de mandar (el hueco simplemente se salta y el siguiente toca cinco tiros después). Si
  ves que dejan de llegar, sube `ANUNCIO_CADA` en `juego.tsx`: es un número y nada más.

## Google (SEO)

- Cada página tiene su dirección normal: `/producto/45-leche-de-oro-250-ml-entera-fresca`, `/buscar?categoria=Despensa`,
  `/tiendas`, `/app`. Los enlaces viejos con `#` siguen funcionando.
- Para que Google y Bing comprueben que el sitio es tuyo, define en Vercel `GOOGLE_SITE_VERIFICATION` y
  `BING_SITE_VERIFICATION` con el código que te den (solo el valor del `content`), o verifícalo por DNS en
  Hostinger y no hace falta tocar nada.
- El logo que sale junto al resultado en Google es `/favicon.ico` (16, 32 y 48 px, cuadrado, generado a partir
  de `public/icon.svg`): Google no acepta cualquier tamaño y tarda en volver a pasar, así que después de
  publicarlo hay que esperar unos días o pedir el rastreo de la portada en Search Console.
- La portada lleva los datos del sitio (`WebSite` y `Organization`, con el logo, el correo y las redes) y la
  acción de búsqueda, para que Google pueda mostrar una caja de búsqueda de Mercapty en sus resultados.
- El servidor entrega cada página con su título, descripción, dirección canónica, vista previa para redes
  (Open Graph) y, en los productos, datos estructurados de Google (precio más bajo y más alto).
- `/sitemap.xml` es un índice que apunta a `/sitemap-paginas.xml` (portada, tiendas, app y categorías)
  y a `/sitemap-productos-N.xml`, de 5.000 direcciones cada uno; `/robots.txt` apunta al índice. Las búsquedas por
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
mobile/         app de Expo: src/app (pantallas), src/components (cerdito, tarjetas…), src/lib (API, lista, ads)
data/           stores.json, feeds/   · generados (fuera de git): mercapty.db, images/, admin-key.txt
.github/        workflows/precios.yml: bots dos veces al día · super99.yml: Súper 99 cada noche
```
