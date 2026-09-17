// Defensa contra comparaciones malas.
//
// Algunas tiendas publican la caja o el paquete de varias unidades con el código de barras
// de la unidad suelta. El precio es de verdad, pero no es el mismo producto: sin defensa
// aparecen «ahorros» de $14.56 en una lata de soda que cuesta $0.56.
//
// Se descarta de la comparación lo que cuesta más de dos veces y media que la oferta más
// barata, siempre que la diferencia llegue a $1.50. Lo segundo evita castigar a los
// productos de centavos, donde el doble sigue siendo una diferencia normal entre tiendas.
// Con los precios de hoy esto aparta 14 productos de 3741, y son los que estaban mal.
export const OUTLIER_RATIO = 2.5;
export const OUTLIER_MIN_GAP = 1.5;

// El precio más barato es siempre comparable: es el que sirve de referencia.
export const isComparable = (price, lowest) =>
  price <= lowest * OUTLIER_RATIO || price - lowest < OUTLIER_MIN_GAP;
