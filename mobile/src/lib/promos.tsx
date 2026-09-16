// Días de descuento que anuncian los súper hoy («Martes de frutas y verduras», «Black
// Friday»), del mismo /api/promos que usa la web. Se piden una vez al abrir la app y se
// usan en la portada y en cada tarjeta de producto.
import { createContext, use, type ReactNode } from 'react';

import type { ProductSummary, Promo } from './api';
import { useFetch } from './use-fetch';

const PromosContext = createContext<Promo[]>([]);

export function PromosProvider({ children }: { children: ReactNode }) {
  const { data } = useFetch<Promo[]>('/api/promos');
  return <PromosContext value={data ?? []}>{children}</PromosContext>;
}

export const usePromos = () => use(PromosContext);

const withoutAccents = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// La promoción de hoy que le aplica a un producto: tiene que ser de una tienda que lo vende,
// de su categoría y, si la promoción afina por palabras, llevar alguna en el nombre.
export function promoFor(item: ProductSummary, promos: Promo[]) {
  const stores = item.storeIds ?? [item.bestStoreId];
  const name = withoutAccents(item.name);
  return promos.find((p) => {
    if (!stores.includes(p.storeId)) return false;
    if (p.categories.length && !p.categories.includes(item.category)) return false;
    if (p.keywords.length && !p.keywords.some((k) => name.includes(k))) return false;
    return true;
  });
}
