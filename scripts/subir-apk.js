// Publica el APK de Android como archivo de una «release» de GitHub, que es de donde lo baja
// el botón de mercapty.com/app.
//
// Hace falta porque EAS borra los archivos del plan gratuito a los catorce días
// («rule-id=expire-internal-free-builds»): su enlace sirve para probar, pero si el botón de la
// web apunta ahí, un día deja de funcionar sin avisar. GitHub, en un repositorio público, los
// guarda sin fecha de caducidad y sin cobrar por las descargas.
//
// Vercel Blob, que era la otra idea, no sirve para esto: su plan gratuito da 10 GB de
// transferencia al mes —unas 68 descargas de un APK de 146 MB— y al pasarse corta el acceso
// durante treinta días, con lo que se caería también todo lo demás que se sirva desde ahí.
//
//   node scripts/subir-apk.js <enlace del .apk de EAS> 1.2.0
//
// Baja el archivo de EAS, crea la release «v<versión>» y sube el APK con el nombre
// mercapty.apk, siempre el mismo. Por eso APK_URL, arriba de public/js/views/app-page.js,
// apunta a /releases/latest/download/mercapty.apk y no hay que cambiarlo nunca: GitHub sirve
// el archivo de la última release publicada. El script solo pone al día APK_VERSION.
//
// Necesita `gh` con sesión iniciada (`gh auth status`).
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGINA = path.join(ROOT, 'public', 'js', 'views', 'app-page.js');
const REPO = 'ZetaCor/Mercapty';
const NOMBRE = 'mercapty.apk'; // el mismo siempre: es lo que hace fija la dirección «latest»

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const [enlace, version] = process.argv.slice(2);
if (!enlace || !version) salir('Uso: node scripts/subir-apk.js <enlace del .apk de EAS> <versión>');

try {
  gh('auth', 'status');
} catch {
  salir('`gh` no tiene sesión iniciada. Corre: gh auth login');
}

console.log(`Bajando ${enlace}`);
const respuesta = await fetch(enlace);
if (!respuesta.ok) salir(`No se pudo bajar el APK: ${respuesta.status} ${respuesta.statusText}`);
const archivo = Buffer.from(await respuesta.arrayBuffer());
const mb = (archivo.length / 1024 / 1024).toFixed(1);
// Un APK empieza por «PK», como todo zip: si bajó una página de error, mejor enterarse aquí.
if (archivo.subarray(0, 2).toString() !== 'PK') salir(`Lo que bajó no es un APK (${mb} MB). Revisa el enlace.`);

const carpeta = await mkdtemp(path.join(tmpdir(), 'mercapty-apk-'));
const local = path.join(carpeta, NOMBRE);
await writeFile(local, archivo);
console.log(`Bajado: ${mb} MB. Publicando la release v${version} en ${REPO}…`);

const etiqueta = `v${version}`;
try {
  gh('release', 'view', etiqueta, '--repo', REPO);
  console.log(`La release ${etiqueta} ya existía: se reemplaza el archivo.`);
  gh('release', 'upload', etiqueta, local, '--repo', REPO, '--clobber');
} catch {
  gh('release', 'create', etiqueta, local, '--repo', REPO,
    '--title', `Mercapty ${version} · Android`,
    '--notes', `App de Android de Mercapty ${version}.\n\nSe instala bajando el archivo desde https://mercapty.com/app. Como todavía no está en Google Play, el teléfono pide permiso para instalar de un origen desconocido.`);
}
await rm(carpeta, { recursive: true, force: true });

// APK_URL no se toca: apunta a «latest» y GitHub resuelve cuál es. Solo cambia la versión que
// se muestra en la página.
const antes = await readFile(PAGINA, 'utf8');
const linea = /^const APK_VERSION = '[^']*';$/m;
if (!linea.test(antes)) salir(`No encontré la línea de APK_VERSION en ${PAGINA}`);
await writeFile(PAGINA, antes.replace(linea, `const APK_VERSION = '${version}';`));

console.log(`\nPublicado: https://github.com/${REPO}/releases/tag/${etiqueta}`);
console.log(`Lo baja el botón desde: https://github.com/${REPO}/releases/latest/download/${NOMBRE}`);
console.log('APK_VERSION quedó al día en app-page.js. Falta commitear y desplegar.');
