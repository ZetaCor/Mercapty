// "Mi lista" vive en el navegador del usuario (no requiere cuenta).
const KEY = 'mercapty:lista';

export function getList() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* modo privado o almacenamiento bloqueado */ }
  window.dispatchEvent(new CustomEvent('list-changed'));
}

export function addToList({ productId, label }) {
  const list = getList();
  const existing = list.find((item) => item.productId === productId);
  if (existing) existing.qty = Math.min(99, existing.qty + 1);
  else list.push({ productId, label, qty: 1 });
  save(list);
}

export function setQty(productId, qty) {
  const list = getList()
    .map((item) => (item.productId === productId ? { ...item, qty: Math.min(99, qty) } : item))
    .filter((item) => item.qty > 0);
  save(list);
}

export function clearList() {
  save([]);
}

export const listCount = () => getList().length;
