import { getAdminKey } from './admin-auth.js';

async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error ?? `Error ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return body;
}

export const getJson = (url) => request(url);

export const postJson = (url, data) => request(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

// Peticiones del panel de administración: llevan la clave en un encabezado.
export function adminRequest(url, { method = 'GET', body, contentType } = {}) {
  const headers = { 'X-Admin-Key': getAdminKey() ?? '' };
  if (contentType) headers['Content-Type'] = contentType;
  return request(url, { method, headers, body });
}
