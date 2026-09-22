// Guarda el APK de Android en Vercel Blob y deja apuntando ahí el botón de mercapty.com/app.
//
// Hace falta porque EAS borra los archivos del plan gratuito a los 14 días
// («expire-internal-free-builds»): el enlace de Expo sirve para probar, pero si el botón de la
// web apunta ahí, un día deja de funcionar sin avisar. En Blob el archivo es nuestro y no
// caduca. Es el mismo almacenamiento donde van las fotos de los productos (server/storage.js).
//
//   npx vercel env pull .env.local                      (una vez: trae BLOB_READ_WRITE_TOKEN)
//   node --env-file=.env.local scripts/subir-apk.js https://expo.dev/artifacts/eas/….apk 1.2.0
//
// Descarga el APK, lo sube, y escribe la dirección nueva y la versión en
// public/js/views/app-page.js. Después queda commitear y desplegar.
//
// Para borrar el APK viejo del almacenamiento, cuando ya nadie lo necesite:
//   node --env-file=.env.local scripts/subir-apk.js --borrar https://….public.blob.vercel-storage.com/…
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGINA = path.join(ROOT, 'public', 'js', 'views', 'app-page.js');
const TIPO = 'application/vnd.android.package-archive';

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  salir('Falta BLOB_READ_WRITE_TOKEN. Sácalo con: npx vercel env pull .env.local\n'
    + 'y corre esto con: node --env-file=.env.local scripts/subir-apk.js …');
}

const [arg1, arg2] = process.argv.slice(2);
if (!arg1) salir('Uso: node --env-file=.env.local scripts/subir-apk.js <enlace del .apk> [versión]');

// Cambia una línea «const NOMBRE = '…';» de app-page.js por el valor nuevo.
async function anotarEnLaPagina(nombre, valor) {
  const antes = await readFile(PAGINA, 'utf8');
  const linea = new RegExp(`^const ${nombre} = '[^']*';$`, 'm');
  if (!linea.test(antes)) salir(`No encontré la línea de ${nombre} en ${PAGINA}`);
  await writeFile(PAGINA, antes.replace(linea, `const ${nombre} = '${valor}';`));
}

if (arg1 === '--borrar') {
  if (!arg2) salir('Uso: node --env-file=.env.local scripts/subir-apk.js --borrar <dirección del blob>');
  const { del } = await import('@vercel/blob');
  await del(arg2);
  console.log(`Borrado del almacenamiento: ${arg2}`);
  process.exit(0);
}

console.log(`Bajando ${arg1}`);
const respuesta = await fetch(arg1);
if (!respuesta.ok) salir(`No se pudo bajar el APK: ${respuesta.status} ${respuesta.statusText}`);
const archivo = Buffer.from(await respuesta.arrayBuffer());
const mb = (archivo.length / 1024 / 1024).toFixed(1);
// Un APK empieza por «PK», como todo zip: si bajó una página de error, mejor enterarse aquí.
if (archivo.subarray(0, 2).toString() !== 'PK') salir(`Lo que bajó no es un APK (${mb} MB). Revisa el enlace.`);
console.log(`Bajado: ${mb} MB. Subiendo a Vercel Blob…`);

const { put } = await import('@vercel/blob');
const version = arg2 ?? 'sin-version';
const blob = await put(`app/mercapty-${version}.apk`, archivo, {
  access: 'public',
  contentType: TIPO,
  addRandomSuffix: true, // cada subida es una dirección nueva; la vieja sigue sirviendo
  multipart: true,       // el archivo pasa de 100 MB
});

await anotarEnLaPagina('APK_URL', blob.url);
if (arg2) await anotarEnLaPagina('APK_VERSION', arg2);

console.log(`\nSubido: ${blob.url}`);
console.log('Ya quedó escrito en public/js/views/app-page.js. Falta commitear y desplegar.');
