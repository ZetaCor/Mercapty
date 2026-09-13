// Clave del panel de administración, guardada solo en este navegador.
const KEY = 'mercapty:admin';

export function getAdminKey() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setAdminKey(value) {
  try { localStorage.setItem(KEY, value); } catch { /* almacenamiento bloqueado */ }
}

export function clearAdminKey() {
  try { localStorage.removeItem(KEY); } catch { /* almacenamiento bloqueado */ }
}

export const isAdmin = () => Boolean(getAdminKey());
