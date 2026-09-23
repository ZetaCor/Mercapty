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

let [enlace, version] = process.argv.slice(2);
if (!enlace || !version) salir('Uso: node scripts/subir-apk.js <enlace del .apk de EAS> <versión>');

// Los <> de la ayuda son un hueco para rellenar, no parte del comando: en la consola de
// Windows «<» es redirección de entrada y el comando ni arranca. Se quitan y ya.
enlace = enlace.replace(/^<|>$/g, '').trim();

// El enlace que EAS enseña al terminar, y el que sale en la web, es el de la PÁGINA de la
// compilación, no el del archivo: bajarlo trae HTML. Si se reconoce esa página (o el puro
// identificador), se le pregunta a `eas` cuál es el .apk de verdad.
const idDeCompilacion = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(enlace)
  ? enlace
  : /\/builds\/([0-9a-f-]{36})/i.exec(enlace)?.[1];
if (idDeCompilacion) {
  console.log(`Eso es la página de la compilación; le pregunto a EAS cuál es el archivo…`);
  let datos;
  try {
    // En Windows `eas` es un .cmd y Node se niega a lanzarlo sin shell (EINVAL: es una
    // protección suya contra inyección). `gh`, que se usa más abajo, es un .exe y por eso
    // nunca dio guerra. Aquí el shell no abre ninguna puerta: el identificador ya pasó por
    // la comprobación de arriba y solo puede tener dígitos, letras de la «a» a la «f» y
    // guiones, así que no hay nada que se pueda colar como parte de la orden.
    datos = JSON.parse(execFileSync(`eas build:view ${idDeCompilacion} --json`,
      { cwd: path.join(ROOT, 'mobile'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true }));
  } catch {
    salir(`No pude preguntarle a EAS por esa compilación.
Revisa que \`eas\` tenga sesión iniciada (\`eas whoami\`), o pasa directamente el enlace
del archivo, del tipo https://expo.dev/artifacts/eas/….apk`);
  }
  if (datos.status !== 'FINISHED') salir(`Esa compilación está en ${datos.status}, todavía no hay APK que subir.`);
  const archivo = datos.artifacts?.applicationArchiveUrl ?? datos.artifacts?.buildUrl;
  if (!archivo) salir('Esa compilación no tiene archivo descargable.');
  if (datos.appVersion && datos.appVersion !== version) {
    salir(`La compilación es la ${datos.appVersion} y le estás poniendo ${version}.
Publicar una con el número de otra deja la web ofreciendo algo que no es.`);
  }
  console.log(`  compilación ${datos.appVersion ?? '?'} (${datos.platform ?? '?'}): ${archivo}`);
  enlace = archivo;
}

// El enlace de las releases es la SALIDA de este script, no su entrada: pasárselo bajaría el
// APK que ya está publicado y lo volvería a subir con un número de versión nuevo. La app
// vieja con etiqueta nueva, y sin que salte ningún error. Mejor negarse.
if (enlace.includes(`github.com/${REPO}/releases`)) {
  salir(`Ese es el enlace del que descarga la web, no el de la compilación.\n`
    + 'Si se usa, se vuelve a publicar el APK que ya está, con otro número de versión.\n'
    + 'El que hace falta es el que da EAS al terminar de compilar, del tipo\n'
    + '  https://expo.dev/artifacts/eas/….apk');
}

// El número tiene que ser el mismo que tenía mobile/app.json al compilar: es el que quedó
// dentro del APK y el que decide a qué versión le llegan las actualizaciones.
const enApp = JSON.parse(await readFile(path.join(ROOT, 'mobile', 'app.json'), 'utf8')).expo?.version;
if (enApp !== version) {
  salir(`Pusiste la versión ${version}, pero mobile/app.json dice ${enApp}.\n`
    + 'El APK lleva dentro la de app.json, así que publicarlo con otro número engaña a quien lo baje.\n'
    + `Si esta compilación es la ${version}, cambia primero app.json y vuelve a compilar.`);
}

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
// Publicar el APK no avisa a nadie: los teléfonos no se enteran solos de que hay uno nuevo
// (eso solo pasa con EAS Update, que cambia el código pero no la app instalada). El aviso va
// a quien tenga una versión anterior a la de mobile/app.json, así que primero conviene que
// esa versión sea la que se acaba de publicar.
console.log(`
Para avisar a los celulares de que hay versión nueva, desde GitHub:
  Actions → «Avisos de la mañana» → Run workflow → Qué avisar: version
Ahí están las credenciales de Turso, que es donde se registran los teléfonos. Corriendo
"npm run notify -- version" en esta máquina, sin esas credenciales, se mira la base local
—vacía— y no se avisa a nadie. Solo lo reciben los que tengan una versión anterior a la de
mobile/app.json, así que primero conviene desplegar la web con APK_VERSION al día.`);
