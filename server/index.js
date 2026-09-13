// Servidor local: npm start -> http://localhost:3000
// En Vercel no se usa este archivo: la API corre como función (api/index.js).
import http from 'node:http';
import { handler, admin } from './app.js';

const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3000; // npm start -- 3001

http.createServer(handler).listen(PORT, () => {
  console.log(`Mercapty listo en http://localhost:${PORT}`);
  console.log(admin.generated
    ? `Panel de imágenes: http://localhost:${PORT}/admin#clave=${admin.key}`
    : `Panel de imágenes: http://localhost:${PORT}/admin (clave definida en ADMIN_KEY)`);
});
