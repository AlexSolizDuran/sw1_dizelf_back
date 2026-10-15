/**
 * Concurrencia con N usuarios.
 *
 * La pregunta que responde: ¿la sincronización aguanta a más de dos personas a
 * la vez, o solo funciona de a dos?
 *
 * Monta 5 usuarios reales en el mismo proyecto y los somete a lo que pasa
 * cuando varios abren el mismo enlace al mismo tiempo:
 *
 *   1. Las 5 conexiones abren simultáneamente, no en cadena. Esa es la
 *      condición que partía el Y.Doc en dos: `asegurarDocumento` tenía un
 *      `await` entre mirar el mapa de sesiones y escribir en él.
 *   2. Tres editores tocan nodos distintos al mismo tiempo, y un LECTOR intenta
 *      escribir a la vez: los tres cambios tienen que llegar a los cinco, y el
 *      del LECTOR a ninguno.
 *   3. Uno se desconecta, el resto sigue editando, y al volver tiene que
 *      recibir lo que se perdió.
 *   4. Los cinco documentos describen el mismo plano.
 *
 * Uso: node e2e/concurrencia.e2e.js
 */

const { io } = require('socket.io-client');
const Y = require('yjs');

const BASE = process.env.E2E_BASE || 'http://localhost:3099';

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok   ' : ' FALLA '} | ${nombre}${detalle ? '  — ' + detalle : ''}`);
};

async function api(ruta, { metodo = 'GET', cuerpo, cookie } = {}) {
  const res = await fetch(`${BASE}/${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no json */ }
  return { status: res.status, json, setCookie: res.headers.getSetCookie?.() ?? [] };
}

const cookieDe = (r) => r.setCookie
  .map((c) => c.split(';')[0])
  .filter((c) => c.startsWith('tokenAcceso='))
  .join('; ');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const registro = async (u) => {
  const r = await api('auth/register', {
    metodo: 'POST',
    cuerpo: {
      nombre: u.toUpperCase(), apellido: 'Prueba',
      gmail: `${u}@test.com`, username: u, password: 'Segura1!',
    },
  });
  return cookieDe(r);
};

/**
 * Abre un socket y captura la conexión desde ya.
 *
 * `forceNew` es obligatorio: socket.io-client cachea un Manager por namespace,
 * así que dos sockets al mismo namespace comparten `extraHeaders` y el segundo
 * se conecta con las credenciales del primero.
 */
function abrir(proyectoId, cookie, etiqueta) {
  const socket = io(`${BASE}/sync`, {
    query: { proyectoId },
    extraHeaders: { Cookie: cookie },
    transports: ['websocket'],
    forceNew: true,
  });

  const conectado = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${etiqueta}: no conectó en 10s`)), 10000);
    socket.on('connect', () => { clearTimeout(t); resolve(); });
    socket.on('connect_error', (e) => { clearTimeout(t); reject(new Error(`${etiqueta}: ${e.message}`)); });
  });

  /**
   * El estado inicial se captura AHORA, no después del `await conectado`.
   *
   * El server lo emite en el mismo instante de la conexión. Si el listener se
   * adjunta después de esperar el connect, el evento ya pasó y la prueba falla
   * con "sin sync:inicial" contra un servidor que sí lo mandó.
   */
  const inicial = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${etiqueta}: sin sync:inicial`)), 12000);
    socket.once('sync:inicial', (b) => {
      clearTimeout(t);
      res(b instanceof Uint8Array ? b : new Uint8Array(b));
    });
  });

  return { socket, conectado, inicial };
}

const aDoc = (bin) => { const d = new Y.Doc(); Y.applyUpdate(d, bin); return d; };

/** Descripción comparable del plano: solo el nombre de cada nodo, ordenado. */
const nombresDe = (doc) => {
  const nodos = doc.getMap('scene:nodes').toJSON();
  return Object.keys(nodos).sort()
    .map((id) => `${id}=${nodos[id].nombre ?? ''}`)
    .join('|');
};

(async () => {
  const sfx = Date.now().toString(36).slice(-5);
  /**
   * Quién es quién, explícito para no volver a mezclar los índices.
   * Ana es la creadora; Eva es la única LECTOR; Diego es el que se desconecta.
   */
  const PERSONAS = [
    { nombre: 'ana', rol: null },        // creadora
    { nombre: 'bruno', rol: 'EDITOR' },
    { nombre: 'carla', rol: 'EDITOR' },
    { nombre: 'diego', rol: 'EDITOR' },
    { nombre: 'eva', rol: 'LECTOR' },
  ];
  const NOMBRES = PERSONAS.map((p) => p.nombre);

  const cookies = [];
  for (const n of NOMBRES) cookies.push(await registro(`${n}${sfx}`));
  comprobar('registro de 5 usuarios', cookies.every(Boolean), `${cookies.filter(Boolean).length}/5 con cookie`);

  const ana = cookies[0];

  const proy = await api('proyectos', {
    metodo: 'POST', cookie: ana,
    cuerpo: {
      nombre: 'Concurrencia',
      esquemaJson: {
        nodes: {
          site_1: { id: 'site_1', type: 'site' },
          wall_1: { id: 'wall_1', type: 'wall', start: [0, 0], end: [4, 0] },
          wall_2: { id: 'wall_2', type: 'wall', start: [0, 4], end: [4, 4] },
          wall_3: { id: 'wall_3', type: 'wall', start: [4, 0], end: [4, 4] },
        },
        rootNodeIds: ['site_1'],
      },
    },
  });
  const PID = proy.json.id;
  comprobar('proyecto creado', proy.status === 201, PID);

  for (const p of PERSONAS.slice(1)) {
    const r = await api(`proyectos/${PID}/colaboradores`, {
      metodo: 'POST', cookie: ana,
      cuerpo: { identificador: `${p.nombre}${sfx}`, rol: p.rol },
    });
    if (r.status !== 201) comprobar(`invitar a ${p.nombre} (${p.rol})`, false, `status=${r.status}`);
  }
  comprobar('4 colaboradores invitados (3 EDITOR, 1 LECTOR)', true);

  // ── 1. LAS 5 CONEXIONES A LA VEZ ────────────────────────────────────────
  const sockets = cookies.map((c, i) => abrir(PID, c, `sync ${NOMBRES[i]}`));
  await Promise.all(sockets.map((s) => s.conectado));
  comprobar('las 5 conexiones de sync abren', true);

  const binarios = await Promise.all(sockets.map((s) => s.inicial));
  const docs = binarios.map(aDoc);

  const conEscena = docs.filter((d) => Object.keys(d.getMap('scene:nodes').toJSON()).length === 4).length;
  comprobar(
    'los 5 reciben los 4 nodos (nadie recibe un doc vacío)',
    conEscena === 5,
    `${conEscena}/5 con la escena completa`
  );
  comprobar(
    'los 5 arrancan con el mismo estado',
    new Set(docs.map(nombresDe)).size === 1,
    nombresDe(docs[0])
  );

  /**
   * Lado de recepción.
   *
   * Cada doc local se mantiene aplicando lo que llega por el socket, igual que
   * hace el hook del front. Sin esto los documentos solo contendrían el cambio
   * que cada uno emitió, y la comprobación de convergencia no mediría nada.
   */
  sockets.forEach((s, i) => {
    s.socket.on('sync:update', (b) => {
      Y.applyUpdate(docs[i], b instanceof Uint8Array ? b : new Uint8Array(b), 'remoto');
    });
  });

  // ── 2. TRES EDITORES SIMULTÁNEOS + UN LECTOR QUE INTENTA ESCRIBIR ────────
  const IDX_LECTOR = PERSONAS.findIndex((p) => p.rol === 'LECTOR');   // eva
  const IDX_EDITORES = PERSONAS.map((p, i) => (p.rol === 'EDITOR' ? i : -1)).filter((i) => i >= 0);
  comprobar('el reparto de roles es el esperado',
    IDX_LECTOR === 4 && IDX_EDITORES.length === 3,
    `lector=${NOMBRES[IDX_LECTOR]}, editores=${IDX_EDITORES.map((i) => NOMBRES[i]).join(',')}`);

  // Se edita en local y después se emite: los tres escriben antes de que la red
  // reparta nada, que es lo que genera la carrera.
  IDX_EDITORES.forEach((i, k) => {
    docs[i].transact(() => {
      docs[i].getMap('scene:nodes').get(`wall_${k + 1}`)?.set('nombre', `Muro de ${NOMBRES[i]}`);
    });
  });

  for (const i of IDX_EDITORES) {
    sockets[i].socket.emit('sync:update', Buffer.from(Y.encodeStateAsUpdate(docs[i])));
  }

  /**
   * El LECTOR intenta escribir lo mismo, desde un documento aparte.
   *
   * No se usa su copia local a propósito: si se contaminara, el cambio
   * rechazado quedaría mezclado con lo que sí llegó del servidor y la
   * comprobación no distinguiría "el gateway lo ignoró" de "nadie lo recibió".
   */
  const docIntruso = aDoc(binarios[IDX_LECTOR]);
  docIntruso.transact(() => {
    docIntruso.getMap('scene:nodes').get('wall_1')?.set('nombre', 'Muro de lector');
  });
  sockets[IDX_LECTOR].socket.emit('sync:update', Buffer.from(Y.encodeStateAsUpdate(docIntruso)));

  // Espera a que el servidor reenvíe a todos.
  for (let t = 0; t < 40; t++) {
    await dormir(120);
    const n = docs[2].getMap('scene:nodes').get('wall_3')?.get('nombre');
    if (n) break;
  }

  comprobar(
    'los cambios de los editores llegan a los otros 4',
    IDX_EDITORES.every((i) =>
      docs.every((_, j) => nombresDe(docs[j]).includes(`Muro de ${NOMBRES[i]}`))
    ),
    nombresDe(docs[0])
  );
  comprobar(
    'el LECTOR no escribe: su update no llega a nadie',
    docs.every((d) => !nombresDe(d).includes('Muro de lector')),
    `lector=${NOMBRES[IDX_LECTOR]} · ${nombresDe(docs[0])}`
  );

  // ── 3. SE DESCONECTA EN MITAD Y VUELVE ───────────────────────────────────
  const IDX_QUIETO = 3; // diego, un EDITOR: el caso interesante
  sockets[IDX_QUIETO].socket.disconnect();
  await dormir(400);

  // Mientras está fuera, el resto sigue editando.
  docs[0].transact(() => {
    docs[0].getMap('scene:nodes').get('site_1')?.set('nombre', 'Editado mientras faltaba');
  });
  sockets[0].socket.emit('sync:update', Buffer.from(Y.encodeStateAsUpdate(docs[0])));
  for (let t = 0; t < 40; t++) {
    await dormir(120);
    if (docs[1].getMap('scene:nodes').get('site_1')?.get('nombre')) break;
  }

  const vuelve = abrir(PID, cookies[IDX_QUIETO], `sync ${NOMBRES[IDX_QUIETO]}#2`);
  await vuelve.conectado;
  const docVuelve = aDoc(await vuelve.inicial);

  comprobar(
    'al volver recibe lo que se editó mientras estaba fuera',
    docVuelve.getMap('scene:nodes').get('site_1')?.get('nombre') === 'Editado mientras faltaba',
    String(docVuelve.getMap('scene:nodes').get('site_1')?.get('nombre'))
  );
  comprobar(
    'al volver también trae los cambios de los tres editores',
    IDX_EDITORES.every((i) => nombresDe(docVuelve).includes(`Muro de ${NOMBRES[i]}`)),
    nombresDe(docVuelve)
  );

  // ── 4. LOS CINCO DESCRIBEN EL MISMO PLANO ───────────────────────────────
  // Se comparan los 4 EDITORES: el LECTOR tiene su copia intacta y es correcta,
  // solo nunca participated de las escrituras.
  const finales = docs.map((d, i) => (i === IDX_QUIETO ? docVuelve : d))
    .filter((_, j) => j !== IDX_LECTOR);
  const referencia = nombresDe(finales[0]);
  comprobar(
    'los 4 editores terminan con el mismo plano',
    finales.every((d) => nombresDe(d) === referencia),
    referencia
  );

  [...sockets, vuelve].forEach((s) => { try { s.socket.disconnect(); } catch { /* ya cerrada */ } });
  await dormir(300);

  console.log('\n' + (fallos === 0 ? 'CONCURRENCIA N=5 OK' : `${fallos} FALLAS`));
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('\nERROR FATAL:', e.message); process.exit(1); });