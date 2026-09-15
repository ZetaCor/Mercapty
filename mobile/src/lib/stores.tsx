import { createContext, use, type ReactNode } from 'react';

import type { Store } from './api';
import { useFetch } from './use-fetch';

// Supermercados (logo, ícono y color), pedidos una vez al abrir la app.
// Las ofertas solo traen el nombre de la tienda: con byName se encuentra su ícono.
type StoresApi = {
  list: Store[];
  active: Store[]; // los que hoy tienen precios
  byId: Map<string, Store>;
  byName: Map<string, Store>;
  refresh(): void;
};

const StoresContext = createContext<StoresApi>({
  list: [],
  active: [],
  byId: new Map(),
  byName: new Map(),
  refresh: () => {},
});

export function StoresProvider({ children }: { children: ReactNode }) {
  const { data, refresh } = useFetch<Store[]>('/api/stores');
  const list = data ?? [];
  const value: StoresApi = {
    list,
    active: list.filter((s) => s.offers > 0),
    byId: new Map(list.map((s) => [s.id, s])),
    byName: new Map(list.map((s) => [s.name, s])),
    refresh,
  };
  return <StoresContext value={value}>{children}</StoresContext>;
}

export const useStores = () => use(StoresContext);
