import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

// «Mi lista» vive en el teléfono (no requiere cuenta), con la misma forma que en la web.
const KEY = 'mercapty:lista';

export type ListItem = { productId: number; label: string; qty: number };

type ListApi = {
  items: ListItem[];
  add(item: { productId: number; label: string }): void;
  setQty(productId: number, qty: number): void;
  clear(): void;
};

const ListContext = createContext<ListApi | null>(null);

export function ListProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ items: ListItem[]; loaded: boolean }>({ items: [], loaded: false });

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const list: unknown = JSON.parse(raw ?? '[]');
        return Array.isArray(list) ? (list as ListItem[]) : [];
      })
      .catch(() => [])
      // Si alguien agregó algo antes de que termine de leer, se conserva.
      .then((stored) => setState((s) => ({ items: s.items.length ? s.items : stored, loaded: true })));
  }, []);

  useEffect(() => {
    if (state.loaded) AsyncStorage.setItem(KEY, JSON.stringify(state.items)).catch(() => {});
  }, [state]);

  const update = (fn: (items: ListItem[]) => ListItem[]) => setState((s) => ({ ...s, items: fn(s.items) }));

  const api: ListApi = {
    items: state.items,
    add: ({ productId, label }) =>
      update((items) =>
        items.some((i) => i.productId === productId)
          ? items.map((i) => (i.productId === productId ? { ...i, qty: Math.min(99, i.qty + 1) } : i))
          : [...items, { productId, label, qty: 1 }],
      ),
    setQty: (productId, qty) =>
      update((items) =>
        items.map((i) => (i.productId === productId ? { ...i, qty: Math.min(99, qty) } : i)).filter((i) => i.qty > 0),
      ),
    clear: () => update(() => []),
  };

  return <ListContext value={api}>{children}</ListContext>;
}

export function useList() {
  const ctx = use(ListContext);
  if (!ctx) throw new Error('useList() va dentro de <ListProvider>');
  return ctx;
}
