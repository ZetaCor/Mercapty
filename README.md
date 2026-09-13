# PanaPrecio

Comparador de precios de supermercados en línea de Panamá. El cliente busca un producto, ve el
precio en cada tienda, cuál lo tiene más barato, y con un clic va a esa tienda a comprarlo.
También arma una lista de compras y calcula si conviene comprar todo en un solo súper o repartir.

> **Estado:** MVP funcional con **precios de demostración**. La arquitectura para conectar
> precios reales ya está lista (ver «Conectar precios reales»).

## Cómo correrlo

Requisitos: Node.js 22.13 o superior. No hay que instalar dependencias.

```bash
npm run ingest   # carga/actualiza precios en data/panaprecio.db
npm start        # abre http://localhost:3000
```

## Qué hace

- **Búsqueda** por nombre, marca o código de barras (sin importar tildes) y por categoría.
- **Ficha de producto:** precio en cada tienda ordenado de menor a mayor, mejor precio destacado,
  ofertas, disponibilidad, precio por kg/L, diferencia contra el mejor precio, historial y
  botón **«Ir a comprar»**.
- **Redirección medible:** `/go/:id` registra el clic y envía al cliente a la tienda con
  `utm_source=panaprecio`. Así la tienda puede atribuir la venta, y ese dato es la base para cobrar.
- **Mi lista:** compara «todo en una tienda» contra «repartir cada producto donde está más barato».
- **Tiendas:** cuántos productos tiene cada una, en cuántos gana y cuántas visitas le enviamos.
- **Fotos de productos:** las que publica la tienda o las que subes tú desde el panel de imágenes.

## Cómo funciona

```
 conectores (demo | feed CSV/JSON | VTEX)
        │  ofertas crudas
        ▼
 scripts/ingest.js ── normaliza GTIN, presentación y precio
        │
        ▼
 SQLite: products ◄── offers ──► stores      price_history, clicks
        │
        ▼
 server/index.js (API JSON + /go/:id) ──► public/ (web responsive, instalable)
```

La clave es **reconocer que dos tiendas venden el mismo producto**. Se usa el código de barras
(GTIN/EAN), normalizado a 14 dígitos: por ejemplo, Super Xtra publica la leche Estrella Azul como
`88209972267` (UPC sin el cero inicial) y queda igual al `088209972267` de otra tienda. Sin código
de barras, se usa marca + nombre + presentación como respaldo.

## Supermercados investigados (septiembre 2026)

| Tienda | Plataforma | Cómo obtener precios |
|---|---|---|
| Súper 99 | Magento | Acuerdo/feed; Magento tiene API GraphQL |
| Riba Smith | Magento (búsqueda Fast Simon) | Acuerdo/feed |
| El Machetazo | VTEX | API pública de catálogo, verificada (conector incluido) |
| Super Xtra | VTEX | API pública de catálogo, verificada (conector incluido) |
| Superunico | WooCommerce | Acuerdo/feed; WooCommerce tiene Store API |
| Supermercados Rey | App Rey Delivery / PedidosYa | Acuerdo con la tienda |
| Merkapp | Por identificar | Por investigar |

Referencia pública: ACODECO publica en [datosabiertos.gob.pa](https://www.datosabiertos.gob.pa/dataset/acodeco-precios-de-productos-de-cba-2022)
los precios de la canasta básica por supermercado (CSV/XLS, mensual). Sirve para validar precios,
pero no para comparar en tiempo real.

## Fotos de productos

Un producto puede recibir su foto de tres formas. La que subes tú siempre tiene prioridad:

1. **Panel de imágenes** (`/#/admin`). Al hacer `npm start`, la consola muestra un enlace con la
   clave de administrador, que también queda guardada en `data/admin-key.txt`. En el panel puedes
   subir o arrastrar una foto a cada producto, filtrar los que no tienen foto y quitar fotos.
   Con la clave guardada en el navegador, la ficha de cada producto también muestra «Agregar foto».
   El navegador reduce la foto a 1000 px y le quita los metadatos (como la ubicación GPS) antes de
   subirla. El servidor solo acepta JPG, PNG o WebP de hasta 3 MB y las guarda en `data/images/`.
2. **Feed de la tienda:** columna `imagen` con la URL de la foto.
3. **VTEX:** el conector trae automáticamente la foto que publica la tienda.

Si una foto de tienda deja de existir, se muestra el ícono de la categoría. **En producción** define
la clave con la variable `ADMIN_KEY` y guarda `data/images/` en un almacenamiento persistente.

## Conectar precios reales

Cada tienda en `data/stores.json` elige su conector con `"connector": { "type": ... }`.

**1. Feed de la tienda (recomendado).** La tienda comparte su inventario en CSV o JSON, como archivo
local o URL. Formato (ver `data/feeds/minisuper-ejemplo.csv`):

```
sku,gtin,nombre,marca,categoria,presentacion,precio,precio_regular,disponible,url,imagen
```

```json
"connector": { "type": "feed", "url": "https://tienda.com/panaprecio.csv" }
```

**2. VTEX (Super Xtra, El Machetazo).** Usa la API pública de catálogo que alimenta su propio
sitio. Trae el código de barras, el precio, el precio regular, la disponibilidad y el enlace directo
al producto. **Actívalo solo con permiso de la tienda o después de revisar sus términos de uso.**

```json
"connector": { "type": "vtex", "queries": ["leche", "arroz", "aceite"], "maxPages": 2, "delayMs": 1500 }
```

**3. Otra plataforma:** crea `connectors/<nombre>.js` que exporte
`fetchOffers(store) -> [{ sku, gtin, name, brand, category, size, price, listPrice, inStock, url }]`
y regístralo en `connectors/index.js`.

Luego programa `npm run ingest` cada pocas horas (Programador de tareas de Windows o cron).
Si una tienda deja de publicar un producto, este queda como agotado automáticamente.

## Antes de lanzar

- **Permiso de las tiendas:** lo ideal es un acuerdo de afiliado o de feed. Además de ser lo
  correcto legalmente, da precios más confiables y abre la puerta a cobrar comisión.
- **Precios exactos:** muestra siempre la fecha de actualización y aclara que el precio final lo
  confirma la tienda (Ley 45 de 2007 de protección al consumidor).
- **Datos personales:** hoy la lista se guarda solo en el navegador. Si agregas cuentas o alertas,
  aplica la Ley 81 de 2019 de protección de datos personales.
- **Envío:** los totales no incluyen envío. Agregar la tarifa y el mínimo de cada tienda mejora el
  cálculo de «Mi lista».

## Modelo de negocio (ideas)

- Comisión por venta o por clic referido (los clics ya se registran por tienda).
- Plan para tiendas: panel con visitas enviadas, productos donde gana o pierde, y ofertas destacadas.
- Publicidad de marcas en búsquedas y categorías.
- Informes de precios del mercado para marcas y distribuidores.

## Próximos pasos

1. Conseguir 1 o 2 tiendas socias (o activar VTEX con permiso) y reemplazar la demo.
2. Programar la ingesta y alertar si un conector falla.
3. Revisión de coincidencias para productos sin código de barras (frutas, carnes, panadería).
4. Alertas de baja de precio, escaneo de código de barras con la cámara y app móvil (la web ya es instalable).
5. Desplegar (Render, Railway o un VPS) y migrar a PostgreSQL cuando crezca el catálogo.

## Estructura

```
connectors/     demo.js, feed.js, vtex.js: de dónde salen los precios
scripts/        ingest.js: actualiza la base
server/         index.js (HTTP), api.js (consultas), db.js (esquema), lib/normalize.js
public/         index.html, styles.css, js/ (app.js, images.js, views/ incluye admin.js)
data/           stores.json, demo-catalog.json, feeds/
                generados (fuera de git): panaprecio.db, images/, admin-key.txt
```
