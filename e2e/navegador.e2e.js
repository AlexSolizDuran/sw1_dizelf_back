/**
 * Colaboración en navegadores reales.
 *
 * El resto de pruebas de `e2e/` habla socket.io con sockets de Node. Eso valida
 * presencia, permisos y persistencia, pero NO valida el editor: nunca ejecuta
 * `@pascal-app`, el store `useScene` ni three.js. Esta prueba abre el editor de
 * verdad en Chromium, edita un piso con teclado como lo haría una persona y
 * comprueba que el otro navegador ve el cambio.
 *
 * Requiere back en :3097 y front en :3096 (ver `e2e/browser-up.sh`).
 *
 * Uso: node e2e/navegador.e2e.js
 */

const { chromium } = require('playwright');

const FRONT = process.env.FRONT_BASE || 'http://localhost:3096';
const API = process.env.API_BASE || 'http://localhost:3097';
// El paquete instalado espera la revisión 1248, pero la caché tiene la 1243.
// Lanzar por defecto aborta con "Executable doesn't exist".
const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`;

/** Igual que `createDefaultScene()` de editor-shell.tsx. */
const ESCENA_DEFECTO = {
  nodes: {
    site_default: {
      id: 'site_default', type: 'site',
      polygon: { type: 'polygon', points: [[-15, -15], [15, -15], [15, 15], [-15, 15]] },
      children: ['building_default'],
    },
    building_default: {
      id: 'building_default', type: 'building', children: ['level_default'],
      position: [0, 0, 0], rotation: [0, 0, 0],
    },
    level_default: { id: 'level_default', type: 'level', level: 0, children: [] },
  },
  rootNodeIds: ['site_default'],
};

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok   ' : ' FALLA '} | ${nombre}${detalle ? '  — ' + detalle : ''}`);
};

async function api(ruta, { metodo = 'GET', cuerpo, cookie } = {}) {
  const res = await fetch(`${API}/${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* respuesta sin json */ }
  const cabeceras = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, json, cabeceras };
}

const cookieDe = (r) =>
  r.cabeceras.map((c) => c.split(';')[0]).filter((c) => c.startsWith('tokenAcceso=')).join('; ');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** El editor montó cuando aparece el enlace de volver del navbar. */
const LISTO = 'a[aria-label="Volver a mis proyectos"]';
/** Botón con el nombre de un piso; el `title` es estable frente a CSS modules. */
const NOMBRE_PISO = 'button[title*="para renombrar"]';
/**
 * Input de renombrado, acotado a la fila del piso.
 *
 * NO puede ser `input` a secas: el editor tiene buscadores de materiales y de
 * objetos siempre montados, así que un selector global matchea uno de ellos y
 * el texto acaba en el campo equivocado. Vive dentro del `<li>` de la fila.
 */
const INPUT_PISO = 'li input';

const esperarEditor = async (page) => {
  await page.waitForSelector(LISTO, { timeout: 60000 });
  // El paquete registra nodos y monta el lienzo después del navbar.
  await page.waitForTimeout(8000);
};

/** Renombra un piso con el gesto real: doble clic, escribir, Enter. */
async function renombrarPiso(page, nombreNuevo) {
  await page.dblclick(NOMBRE_PISO);
  const input = page.locator(INPUT_PISO);
  await input.waitFor({ state: 'visible', timeout: 10000 });
  // Se confirma que el input es el del piso y no otro campo del editor.
  const previo = await input.inputValue();
  await input.fill(nombreNuevo);
  await input.press('Enter');
  return previo;
}

/** Texto del indicador de presencia. */
const textoPresencia = (page) =>
  page.evaluate(() => {
    const n = document.body.innerText.match(/(\d+) en el plano|Solo vos/);
    return n ? n[0] : null;
  });

const nombreDePisoEn = (page) =>
  page.evaluate(() => document.querySelector('button[title*="para renombrar"]')?.textContent?.trim() ?? null);

/**
 * ¿Aparece un texto en la pantalla del otro navegador?
 *
 * Se busca en `outerHTML` y no en `innerText` a propósito: `innerText` descarta
 * lo que no está renderizado, y el selector de pisos está colapsado hasta que
 * se abre. Con `innerText` el cambio collaborative llegaba igual y la prueba
 * decía que no.
 */
const textoEnPantalla = (page, texto) =>
  page.evaluate((t) => document.documentElement.outerHTML.includes(t), texto);

(async () => {
  const sfx = Date.now().toString(36).slice(-5);

  // ── Datos: 3 usuarios; Ana crea, Luis edita, Mia solo lee ────────────────
  const registrar = async (u) => {
    const r = await api('auth/register', {
      metodo: 'POST',
      cuerpo: { nombre: u.toUpperCase(), apellido: 'Nav', gmail: `${u}${sfx}@test.com`, username: `${u}${sfx}`, password: 'Segura1!' },
    });
    return cookieDe(r);
  };

  const cookieAna = await registrar('ana');
  const cookieLuis = await registrar('luis');
  const cookieMia = await registrar('mia');

  const proy = await api('proyectos', {
    metodo: 'POST', cookie: cookieAna,
    cuerpo: { nombre: 'Plano compartido', esquemaJson: { version: 1, vista: '2d', scene: ESCENA_DEFECTO } },
  });
  const pid = proy.json.id;
  comprobar('proyecto creado', proy.status === 201, pid);

  const inv1 = await api(`proyectos/${pid}/colaboradores`, { metodo: 'POST', cookie: cookieAna, cuerpo: { identificador: `luis${sfx}`, rol: 'EDITOR' } });
  const inv2 = await api(`proyectos/${pid}/colaboradores`, { metodo: 'POST', cookie: cookieAna, cuerpo: { identificador: `mia${sfx}`, rol: 'LECTOR' } });
  comprobar('Luis invitado como EDITOR', inv1.status === 201, String(inv1.status));
  comprobar('Mia invitada como LECTOR', inv2.status === 201, String(inv2.status));

  // ── Tres navegadores, tres contextos aislados ────────────────────────────
  const navegador = await chromium.launch({ executablePath: CHROME, headless: true });

  const abrirComo = async (cookie, etiqueta) => {
    const ctx = await navegador.newContext({ baseURL: FRONT });
    await ctx.addCookies([{ name: 'tokenAcceso', value: cookie.split('=')[1], domain: 'localhost', path: '/' }]);
    const page = await ctx.newPage();
    const ruido = /simplesvg|iconify|unisvg|Content Security|violates|\.webp|Failed to load resource/;
    page.on('pageerror', (e) => {
      if (!ruido.test(e.message)) console.log(`   [${etiqueta} pageerror] ${e.message.split('\n')[0]}`);
    });
    page.on('console', (m) => {
      const t = m.text();
      if (t.includes('[DBG')) console.log(`   [${etiqueta}] ${t.slice(0, 220)}`);
      else if (m.type() === 'error' && !ruido.test(t)) console.log(`   [${etiqueta} console] ${t.slice(0, 180)}`);
    });
    return { ctx, page };
  };

  const ana = await abrirComo(cookieAna, 'ana');
  const luis = await abrirComo(cookieLuis, 'luis');
  const mia = await abrirComo(cookieMia, 'mia');

  console.log('\n── abriendo el editor en los tres navegadores');
  await Promise.all([
    ana.page.goto(`${FRONT}/editor/${pid}`),
    luis.page.goto(`${FRONT}/editor/${pid}`),
    mia.page.goto(`${FRONT}/editor/${pid}`),
  ]);
  await Promise.all([esperarEditor(ana.page), esperarEditor(luis.page), esperarEditor(mia.page)]);
  comprobar('los 3 editores montan', true);

  // ── El LECTOR entra en solo lectura ──────────────────────────────────────
  const badgeLector = await mia.page.$('text=Solo lectura');
  const guardarLector = await mia.page.$('button[aria-label="Guardar una versión del plano"]');
  const historialLector = await mia.page.$('button[aria-label="Historial de versiones"]');
  comprobar('el LECTOR ve el distintivo "Solo lectura"', Boolean(badgeLector));
  comprobar('el LECTOR no puede guardar versión', guardarLector === null);
  comprobar('el LECTOR no tiene historial de versiones', historialLector === null);

  comprobar('el EDITOR sí puede guardar versión', Boolean(await ana.page.$('button[aria-label="Guardar una versión del plano"]')));
  comprobar('el EDITOR sí tiene historial de versiones', Boolean(await ana.page.$('button[aria-label="Historial de versiones"]')));

  // ── Presencia real por WebSocket ─────────────────────────────────────────
  console.log('── esperando la presencia por WebSocket');
  await dormir(4000);
  const pAna = await textoPresencia(ana.page);
  const pLuis = await textoPresencia(luis.page);
  const pMia = await textoPresencia(mia.page);
  comprobar('Ana ve a los demás en el plano', /\d+ en el plano/.test(pAna || ''), String(pAna));
  comprobar('Luis ve a los demás en el plano', /\d+ en el plano/.test(pLuis || ''), String(pLuis));
  comprobar('el LECTOR también ve la presencia', /\d+ en el plano/.test(pMia || ''), String(pMia));

  // ── Ana renombra el piso; Luis debe verlo en su pantalla ─────────────────
  const pisoOriginal = await nombreDePisoEn(ana.page);
  const pisoAna = `Piso de Ana ${sfx}`;
  console.log(`── Ana renombra "${pisoOriginal}" a "${pisoAna}"`);
  const previoAna = await renombrarPiso(ana.page, pisoAna);
  comprobar('el input de renombrado es el del piso', previoAna === pisoOriginal, `venía con "${previoAna}"`);

  await dormir(600);
  comprobar(
    'el renombrado se ve en la propia pantalla de Ana',
    (await nombreDePisoEn(ana.page)) === pisoAna,
    String(await nombreDePisoEn(ana.page)),
  );

  await dormir(1200);
  comprobar('Luis ve en SU PANTALLA el piso que Ana renombró', await textoEnPantalla(luis.page, pisoAna), pisoAna);

  // ── El cambio llegó a la base por el documento vivo ──────────────────────
  await dormir(3000); // autosave de 1s + red
  const doc = await api(`proyectos/${pid}`, { cookie: cookieLuis });
  // El documento vivo se materializa con la escena DESENVUELTA: el `scene` de
  // nivel superior es `esquemaJson`, no `esquemaJson.scene`.
  const nodos = doc.json?.esquemaJson?.nodes ?? doc.json?.esquemaJson?.scene?.nodes ?? {};
  const niveles = Object.values(nodos).filter((n) => n?.type === 'level');
  comprobar(
    'el servidor persistió el nombre nuevo en el documento vivo',
    niveles.some((n) => n?.name === pisoAna),
    JSON.stringify(niveles.map((n) => n?.name)),
  );
  comprobar('el origen del documento es el documento vivo', doc.json?.origen === 'COLABORATIVO', `origen=${doc.json?.origen}`);

  // ── Y al revés: Luis edita, Ana lo ve ────────────────────────────────────
  const pisoLuis = `Piso de Luis ${sfx}`;
  console.log(`── Luis renombra a "${pisoLuis}"`);
  await renombrarPiso(luis.page, pisoLuis);
  await dormir(1500);
  comprobar('Ana ve en su pantalla el piso que Luis renombró', await textoEnPantalla(ana.page, pisoLuis), pisoLuis);

  await navegador.close();
  console.log('\n' + (fallos === 0 ? 'NAVEGADORES OK' : `${fallos} FALLAS`));
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\nERROR FATAL:', e.message);
  process.exit(1);
});