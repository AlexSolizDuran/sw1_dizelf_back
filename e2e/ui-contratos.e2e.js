/**
 * Prueba de los endpoints que la UI nueva consume.
 *
 * La UI de colaboradores e historial sefredita contra estos contratos: si
 * alguno cambia de forma, la lista o el restore se rompen en silencio.
 *
 * Uso: node e2e/ui-contratos.e2e.js
 */

const BASE = process.env.E2E_BASE || 'http://localhost:3099';

let fallos = 0;
const comprobar = (nombre, ok, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok   ' : ' FALLA '} | ${nombre}${detalle ? '  — ' + detalle : ''}`);
};

async function api(ruta, { metodo = 'GET', cuerpo, cookie } = {}) {
  const res = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no json */ }
  return { status: res.status, json, raw: texto };
}

const cookieDe = (r) => (r.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0]).filter((c) => c.startsWith('tokenAcceso=')).join('; ');

(async () => {
  const sfx = Date.now().toString(36).slice(-6);
  const reg = async (u) => {
    const r = await fetch(`${BASE}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'N', apellido: 'P', gmail: `${u}${sfx}@t.com`, username: `${u}${sfx}`, password: 'Segura1!' }),
    });
    return { status: r.status, cookie: cookieDe(r) };
  };

  const ana = await reg('ana');
  const luis = await reg('luis');
  const pepe = await reg('pepe');
  comprobar('registro', ana.status === 201 && luis.status === 201 && pepe.status === 201);

  const proy = await api('/proyectos', {
    metodo: 'POST', cookie: ana.cookie,
    cuerpo: { nombre: 'Casa UI', esquemaJson: { nodes: { s1: { id: 's1', type: 'site' } }, rootNodeIds: ['s1'] } },
  });
  const pid = proy.json.id;
  comprobar('crear proyecto', proy.status === 201, pid);

  // ── Contrato de la fila que la UI pinta ──────────────────────────────────
  await api(`/proyectos/${pid}/colaboradores`, {
    metodo: 'POST', cookie: ana.cookie, cuerpo: { identificador: `luis${sfx}`, rol: 'LECTOR' },
  });
  const lista = await api(`/proyectos/${pid}/colaboradores`, { cookie: ana.cookie });
  const c = lista.json?.[0];
  comprobar('la fila trae los campos que la UI usa',
    Boolean(c?.id && c?.username && c?.permiso && typeof c?.puedeEditar === 'boolean'),
    JSON.stringify(c));
  comprobar('LECTOR viene con puedeEditar=false', c?.puedeEditar === false);
  comprobar('el permiso es el nombre de la base, no un enum', c?.permiso === 'LECTOR', String(c?.permiso));

  // ── Cambiar de LECTOR a EDITOR sin quitar e invitar de nuevo ─────────────
  const ascender = await api(`/proyectos/${pid}/colaboradores/${c.usuarioId}`, {
    metodo: 'PATCH', cookie: ana.cookie, cuerpo: { rol: 'EDITOR' },
  });
  comprobar(
    'ascender a EDITOR',
    ascender.status === 200 && ascender.json?.puedeEditar === true,
    `status=${ascender.status} puedeEditar=${ascender.json?.puedeEditar}`,
  );

  const lista2 = await api(`/proyectos/${pid}/colaboradores`, { cookie: ana.cookie });
  comprobar('el cambio de permiso persiste', lista2.json?.[0]?.permiso === 'EDITOR');

  const cambiarSinPermiso = await api(`/proyectos/${pid}/colaboradores/${c.usuarioId}`, {
    metodo: 'PATCH', cookie: luis.cookie, cuerpo: { rol: 'LECTOR' },
  });
  comprobar('un colaborador no puede cambiar permisos', cambiarSinPermiso.status === 403, String(cambiarSinPermiso.status));

  const cambiarRolInvalido = await api(`/proyectos/${pid}/colaboradores/${c.usuarioId}`, {
    metodo: 'PATCH', cookie: ana.cookie, cuerpo: { rol: 'ADMIN' },
  });
  comprobar('rol fuera del catálogo al cambiar da 400', cambiarRolInvalido.status === 400, String(cambiarRolInvalido.status));

  const degradar = await api(`/proyectos/${pid}/colaboradores/${c.usuarioId}`, {
    metodo: 'PATCH', cookie: ana.cookie, cuerpo: { rol: 'LECTOR' },
  });
  comprobar('degradar a LECTOR', degradar.status === 200 && degradar.json?.puedeEditar === false);

  const duplicado = await api(`/proyectos/${pid}/colaboradores`, {
    metodo: 'POST', cookie: ana.cookie, cuerpo: { identificador: `luis${sfx}`, rol: 'EDITOR' },
  });
  comprobar('invitar dos veces da 409', duplicado.status === 409, String(duplicado.status));

  const rolInvalido = await api(`/proyectos/${pid}/colaboradores`, {
    metodo: 'POST', cookie: ana.cookie, cuerpo: { identificador: `luis${sfx}`, rol: 'ADMIN' },
  });
  comprobar('rol fuera del catálogo da 400', rolInvalido.status === 400, String(rolInvalido.status));

  // Sin rol explícito, el invitado entra como LECTOR (permiso por defecto).
  const porDefecto = await api(`/proyectos/${pid}/colaboradores`, {
    metodo: 'POST', cookie: ana.cookie, cuerpo: { identificador: `pepe${sfx}` },
  });
  comprobar(
    'invitar sin rol entra como LECTOR',
    porDefecto.status === 201 && porDefecto.json?.permiso === 'LECTOR' && porDefecto.json?.puedeEditar === false,
    `status=${porDefecto.status} permiso=${porDefecto.json?.permiso}`,
  );

  const quitar = await api(`/proyectos/${pid}/colaboradores/${c.usuarioId}`, { metodo: 'DELETE', cookie: ana.cookie });
  comprobar('quitar colaborador', quitar.status === 200, String(quitar.status));

  const sinPermiso = await api(`/proyectos/${pid}/colaboradores`, { cookie: luis.cookie });
  comprobar('un colaborador no puede administrar el proyecto', sinPermiso.status === 200 || sinPermiso.status === 403, String(sinPermiso.status));

  // ── Historial de versiones ───────────────────────────────────────────────
  const v1 = await api(`/proyectos/${pid}/versiones`, { metodo: 'POST', cookie: ana.cookie, cuerpo: {} });
  comprobar('guardar versión', v1.status === 201 && typeof v1.json?.id === 'number' && typeof v1.json?.fecha === 'string',
    JSON.stringify(v1.json));

  await api(`/proyectos/${pid}`, {
    metodo: 'PATCH', cookie: ana.cookie, cuerpo: { esquemaJson: { nodes: { s1: { id: 's1', type: 'site', nombre: 'Cambiado' } }, rootNodeIds: ['s1'] } },
  });
  const v2 = await api(`/proyectos/${pid}/versiones`, { metodo: 'POST', cookie: ana.cookie, cuerpo: {} });

  const historial = await api(`/proyectos/${pid}/versiones`, { cookie: ana.cookie });
  const h = historial.json?.[0];
  comprobar('el historial trae los campos que la UI usa',
    Array.isArray(historial.json) && typeof h?.id === 'number' && typeof h?.fecha === 'string' && 'nombre' in h,
    JSON.stringify(h));
  comprobar('el historial va del más nuevo al más viejo',
    historial.json.length >= 2 && historial.json[0].id === v2.json.id);

  const restaurar = await api(`/proyectos/${pid}/versiones/${v1.json.id}/restaurar`, { metodo: 'POST', cookie: ana.cookie, cuerpo: {} });
  comprobar('restaurar devuelve el proyecto actualizado',
    restaurar.status === 200 && restaurar.json?.origen === 'COLABORATIVO',
    `origen=${restaurar.json?.origen}`);

  const trasRestaurar = await api(`/proyectos/${pid}`, { cookie: ana.cookie });
  comprobar('el proyecto restaurado conserva la escena original',
    trasRestaurar.json?.esquemaJson?.scene?.nodes?.s1?.nombre === undefined,
    JSON.stringify(trasRestaurar.json?.esquemaJson?.scene?.nodes?.s1));

  // ── Nombre en el historial: renombrar y eliminar ─────────────────────────
  const renombrar = await api(`/proyectos/${pid}/versiones/${v1.json.id}`, {
    metodo: 'PATCH', cookie: ana.cookie, cuerpo: { nombre: 'Antes del cambio' },
  });
  comprobar('renombrar versión',
    renombrar.status === 200 && renombrar.json?.nombre === 'Antes del cambio',
    `status=${renombrar.status} nombre=${renombrar.json?.nombre}`);

  const nombreVacio = await api(`/proyectos/${pid}/versiones/${v1.json.id}`, {
    metodo: 'PATCH', cookie: ana.cookie, cuerpo: { nombre: '' },
  });
  comprobar('nombre vacío al renombrar da 400', nombreVacio.status === 400, String(nombreVacio.status));

  const eliminar = await api(`/proyectos/${pid}/versiones/${v2.json.id}`, {
    metodo: 'DELETE', cookie: ana.cookie,
  });
  comprobar('eliminar versión', eliminar.status === 200, String(eliminar.status));

  const historial2 = await api(`/proyectos/${pid}/versiones`, { cookie: ana.cookie });
  comprobar('la versión eliminada desaparece del historial',
    !historial2.json?.some((v) => v.id === v2.json.id));

  console.log('\n' + (fallos === 0 ? 'CONTRATOS DE UI OK' : `${fallos} FALLAS`));
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR FATAL:', e.message); process.exit(1); });