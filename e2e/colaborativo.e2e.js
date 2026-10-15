/**
 * Prueba de extremo a extremo del canal colaborativo.
 *
 * Levanta el backend contra una base limpia y comprueba el ciclo completo con
 * dos usuarios reales: registro, login, invitación con permiso, handshake del
 * socket, presencia, sincronización del plano y bloqueo del LECTOR.
 *
 * No es un test de unidad: sube la app y abre sockets de verdad, que es lo que
 * faltaba verificar.
 *
 * Uso: node dist-e2e.js   (con NEON_DB_URL apuntando a la base de prueba)
 */

const { io } = require('socket.io-client');
const Y = require('yjs');

const BASE = process.env.E2E_BASE || 'http://localhost:3099';

/**
 * `forceNew` es obligatorio en cada socket de esta prueba.
 *
 * socket.io-client cachea un `Manager` por namespace: dos sockets al mismo
 * namespace sin `forceNew` comparten manager, y con él los `extraHeaders` del
 * primero. El segundo se conecta con las credenciales del otro, y la prueba
 * falla con "no podés entrar" para un usuario que sí es miembro.
 *
 * En el navegador no pasa: hay un solo socket por usuario.
 */
const API = `${BASE}/`;

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok   ' : ' FALLA '} | ${nombre}${detalle ? '  — ' + detalle : ''}`);
};

async function api(ruta, { metodo = 'GET', cuerpo, cookie } = {}) {
  const res = await fetch(API + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    redirect: 'manual',
  });
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no json */ }
  return { status: res.status, json, raw: texto, setCookie: res.headers.getSetCookie?.() ?? [] };
}

/** Las cookies de login que viajan al backend. */
function cookieDe(respuesta) {
  return respuesta.setCookie
    .map((c) => c.split(';')[0])
    .filter((c) => c.startsWith('tokenAcceso='))
    .join('; ');
}

/**
 * Crea el socket y captura la conexión desde ya.
 *
 * Adjuntar el listener después es una carrera: con `forceNew` el handshake
 * puede completarse antes de que se llegue al `await esperarConexion`, y el
 * evento 'connect' ya pasó sin que nadie lo escuchara.
 */
function abrir(base, namespace, query, cookie, etiqueta) {
  const socket = io(`${base}/${namespace}`, {
    query,
    extraHeaders: { Cookie: cookie },
    transports: ['websocket'],
    forceNew: true,
  });
  const conectado = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${etiqueta}: no conectó en 10s`)), 10000);
    socket.on('connect', () => { clearTimeout(t); resolve(); });
    socket.on('connect_error', (e) => { clearTimeout(t); reject(new Error(`${etiqueta}: ${e.message}`)); });
  });
  return { socket, conectado };
}

/** Espera a que la lista de presencia tenga al menos `n` personas. */
async function esperarLista(socket, n, ms) {
  const limite = Date.now() + ms;
  let ultima = [];
  while (Date.now() < limite) {
    ultima = await esperarEvento(socket, 'presencia:lista', 'lista', 1500).catch(() => ultima);
    if (ultima.length >= n) return ultima;
  }
  return ultima;
}

function esperarEvento(socket, evento, etiqueta, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${etiqueta}: sin '${evento}' en ${ms}ms`)), ms);
    socket.once(evento, (d) => { clearTimeout(t); resolve(d); });
  });
}

(async () => {
  const sufijo = Date.now().toString(36).slice(-6);

  // ── 1. Dos usuarios reales ────────────────────────────────────────────────
  const ana = await api('auth/register', {
    metodo: 'POST',
    cuerpo: { nombre: 'Ana', apellido: 'Pérez', gmail: `ana${sufijo}@test.com`, username: `ana${sufijo}`, password: 'Segura1!' },
  });
  const luis = await api('auth/register', {
    metodo: 'POST',
    cuerpo: { nombre: 'Luis', apellido: 'Gómez', gmail: `luis${sufijo}@test.com`, username: `luis${sufijo}`, password: 'Segura1!' },
  });
  comprobar('registro de dos usuarios', ana.status === 201 && luis.status === 201, `ana=${ana.status} luis=${luis.status}`);

  const cookieAna = cookieDe(ana);
  const cookieLuis = cookieDe(luis);
  comprobar('ambos reciben cookie de sesión', Boolean(cookieAna && cookieLuis));

  // ── 2. Ana crea un proyecto e invita a Luis como EDITOR ───────────────────
  const proyecto = await api('proyectos', {
    metodo: 'POST',
    cookie: cookieAna,
    cuerpo: { nombre: 'Casa E2E', esquemaJson: { nodes: { site_1: { id: 'site_1', type: 'site' } }, rootNodeIds: ['site_1'] } },
  });
  comprobar('crear proyecto', proyecto.status === 201, `status=${proyecto.status}`);
  const pid = proyecto.json?.id;

  const invitar = await api(`proyectos/${pid}/colaboradores`, {
    metodo: 'POST',
    cookie: cookieAna,
    cuerpo: { identificador: `luis${sufijo}`, rol: 'EDITOR' },
  });
  comprobar('invitar con rol EDITOR', invitar.status === 201, `status=${invitar.status} ${invitar.raw.slice(0, 120)}`);

  const listar = await api(`proyectos/${pid}/colaboradores`, { cookie: cookieAna });
  comprobar('listar colaboradores', listar.status === 200 && listar.json?.length === 1, `n=${listar.json?.length}`);

  // ── 3. El LECTOR no puede escribir ────────────────────────────────────────
  const mia = await api('auth/register', {
    metodo: 'POST',
    cuerpo: { nombre: 'Mia', apellido: 'Soto', gmail: `mia${sufijo}@test.com`, username: `mia${sufijo}`, password: 'Segura1!' },
  });
  const cookieMia = cookieDe(mia);
  const invitarLector = await api(`proyectos/${pid}/colaboradores`, {
    metodo: 'POST',
    cookie: cookieAna,
    cuerpo: { identificador: `mia${sufijo}`, rol: 'LECTOR' },
  });
  comprobar('invitar con rol LECTOR', invitarLector.status === 201, `status=${invitarLector.status}`);

  const patchLector = await api(`proyectos/${pid}`, {
    metodo: 'PATCH',
    cookie: cookieMia,
    cuerpo: { esquemaJson: { nodes: {} } },
  });
  comprobar('LECTOR recibe 403 al PATCH', patchLector.status === 403, `status=${patchLector.status}`);

  const guardarLector = await api(`proyectos/${pid}/versiones`, {
    metodo: 'POST',
    cookie: cookieMia,
    cuerpo: {},
  });
  comprobar('LECTOR recibe 403 al guardar versión', guardarLector.status === 403, `status=${guardarLector.status}`);

  const leerLector = await api(`proyectos/${pid}`, { cookie: cookieMia });
  comprobar('LECTOR sí puede leer', leerLector.status === 200, `status=${leerLector.status} puedeEditar=${leerLector.json?.puedeEditar}`);

  // ── 4. Un no-miembro no entra ─────────────────────────────────────────────
  const fuera = await api('auth/register', {
    metodo: 'POST',
    cuerpo: { nombre: 'Fulano', apellido: 'Nadie', gmail: `fulano${sufijo}@test.com`, username: `ful${sufijo}`, password: 'Segura1!' },
  });
  const fueraSocket = io(`${BASE}/sync`, {
    query: { proyectoId: pid },
    extraHeaders: { Cookie: cookieDe(fuera) },
    transports: ['websocket'],
    forceNew: true,
  });
  let errorFuera = null;
  await new Promise((r) => {
    fueraSocket.on('presencia:error', (p) => { errorFuera = p?.mensaje; r(); });
    fueraSocket.on('disconnect', () => { errorFuera = errorFuera ?? 'desconectado'; r(); });
    setTimeout(r, 5000);
  });
  comprobar('no miembro es rechazada en el handshake', Boolean(errorFuera), String(errorFuera));

  // ── 5. Presencia: Ana y Luis conectados ───────────────────────────────────
  const a = abrir(BASE, 'presencia', { proyectoId: pid }, cookieAna, 'presencia Ana');
  const l = abrir(BASE, 'presencia', { proyectoId: pid }, cookieLuis, 'presencia Luis');
  const pAna = a.socket;
  const pLuis = l.socket;
  if (process.env.E2E_DEBUG) {
    for (const [s, tag] of [[pAna, 'ANA'], [pLuis, 'LUIS']]) {
      s.on('presencia:error', (p) => console.log(`   [dbg] ${tag} error server: ${p?.mensaje}`));
      s.on('presencia:lista', (x) => console.log(`   [dbg] ${tag} lista=${x.length} [${x.map(y=>y.usuarioId).join(',')}]`));
    }
  }
  await Promise.all([a.conectado, l.conectado]);

  // El `connect` de socket.io ocurre antes de que el gateway termine sus
  // consultas a la base: la lista puede llegar con uno solo. Se sondea hasta
  // que estén los dos, en vez de mirar el primer evento.
  const lista = await esperarLista(pLuis, 2, 6000);
  comprobar(
    'presencia: ambos aparecen',
    lista.length >= 2,
    lista.length === 0 ? 'nunca llegó una lista' : `${lista.length} presentes`
  );

  // ── 6. Sincronización: una edición de Ana llega a Luis ────────────────────
  const sa = abrir(BASE, 'sync', { proyectoId: pid }, cookieAna, 'sync Ana');
  const sl = abrir(BASE, 'sync', { proyectoId: pid }, cookieLuis, 'sync Luis');
  const sAna = sa.socket;
  const sLuis = sl.socket;
  await Promise.all([sa.conectado, sl.conectado]);

  const inicialAna = await esperarEvento(sAna, 'sync:inicial', 'sync inicial Ana');
  const docAna = new Y.Doc();
  Y.applyUpdate(docAna, new Uint8Array(inicialAna));

  const nodosAna = docAna.getMap('scene:nodes').toJSON();
  comprobar('el doc inicial trae la escena del proyecto', Boolean(nodosAna.site_1), JSON.stringify(Object.keys(nodosAna)));

  const esperaLuis = esperarEvento(sLuis, 'sync:update', 'update en Luis');

  docAna.transact(() => {
    docAna.getMap('scene:nodes').get('site_1')?.set('nombre', 'Terrano norte');
  });
  // Estado completo: Yjs ignora lo que el receptor ya tiene, así que mandarlo
  // entero es válido y evita tener que negociar state vectors en el test.
  sAna.emit('sync:update', Buffer.from(Y.encodeStateAsUpdate(docAna)));

  const recibidoLuis = await esperaLuis;
  const docLuis = new Y.Doc();
  Y.applyUpdate(docLuis, new Uint8Array(recibidoLuis));
  comprobar(
    'sync: el update cruza el socket y Luis lo aplica',
    docLuis.getMap('scene:nodes').toJSON().site_1?.nombre === 'Terrano norte',
    JSON.stringify(docLuis.getMap('scene:nodes').toJSON().site_1)
  );

  // ── 7. El LECTOR no puede emitir updates ──────────────────────────────────
  const sm = abrir(BASE, 'sync', { proyectoId: pid }, cookieMia, 'sync Mia');
  const sMia = sm.socket;
  await sm.conectado;
  const esperaAna = esperarEvento(sAna, 'sync:update', 'update en Ana desde LECTOR');
  sMia.emit('sync:update', Y.encodeStateAsUpdate(docAna));
  const llego = await esperaAna.then(() => true).catch(() => false);
  comprobar('LECTOR no puede emitir updates', !llego, 'si llegó, el bloqueo falló');

  // ── 8. El guardado manual consolida ───────────────────────────────────────
  const version = await api(`proyectos/${pid}/versiones`, { metodo: 'POST', cookie: cookieAna, cuerpo: {} });
  comprobar('guardado manual crea versión', version.status === 201 && Boolean(version.json?.id), `status=${version.status}`);

  const historial = await api(`proyectos/${pid}/versiones`, { cookie: cookieAna });
  comprobar('historial lista versiones', historial.status === 200 && historial.json?.length >= 1, `n=${historial.json?.length}`);

  const restaurar = await api(`proyectos/${pid}/versiones/${version.json.id}/restaurar`, { metodo: 'POST', cookie: cookieAna, cuerpo: {} });
  comprobar('restaurar versión', restaurar.status === 200, `status=${restaurar.status}`);

  [pAna, pLuis, sAna, sLuis, sMia, fueraSocket].forEach((s) => { try { s.disconnect(); } catch {} });

  console.log('\n' + (fallos === 0 ? 'E2E COMPLETA OK' : `${fallos} FALLAS`));
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\nERROR FATAL:', e.message);
  process.exit(1);
});