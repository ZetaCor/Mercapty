import { useEffect, useState } from 'react';

import { getJson } from './api';

type State<T> = { data?: T; error?: Error; loading: boolean };

// Pide una ruta de la API (con la caché de getJson). refresh() la vuelve a pedir
// al servidor, por ejemplo al jalar la pantalla hacia abajo.
export function useFetch<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ loading: path != null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path == null) return;
    let alive = true;
    setState((s) => ({ data: s.data, loading: true }));
    getJson<T>(path, { fresh: version > 0 }).then(
      (data) => {
        if (alive) setState({ data, loading: false });
      },
      (error: Error) => {
        if (alive) setState((s) => ({ data: s.data, error, loading: false }));
      },
    );
    return () => {
      alive = false;
    };
  }, [path, version]);

  return { ...state, refresh: () => setVersion((v) => v + 1) };
}
