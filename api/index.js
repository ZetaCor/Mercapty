// Función de Vercel: atiende /api/* y /go/* (ver vercel.json). Las páginas de
// public/ las sirve Vercel directamente.
export { handler as default } from '../server/app.js';
