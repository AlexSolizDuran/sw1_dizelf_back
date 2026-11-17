/**
 * Deja listo el Object Storage de Neon en un solo paso.
 *
 * QUÉ HACE
 *   1. Resuelve el proyecto y la rama (o usa NEON_PROJECT_ID / NEON_BRANCH_ID).
 *   2. Crea el bucket `modelos-ar` si no existe (privado).
 *   3. Mintea una credencial con `storage:read` + `storage:write` si todavía no
 *      hay AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY en el entorno.
 *   4. Obtiene el endpoint S3 y la región de la rama.
 *   5. Escribe MODELOS_BUCKET / AWS_* en el `.env` sin pisar el resto.
 *   6. Aplica la regla CORS que el navegador necesita para el PUT prefirmado.
 *
 * NUNCA imprime secretos: ni la API key, ni el secret de la credencial.
 *
 * Uso:
 *   1. Agregá `NEON_API_KEY=...` a dizelf_back/.env (Neon Console → perfil →
 *      Settings → API keys). Ese archivo no se comparte ni se sube.
 *   2. npm run storage:preparar
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  CreateBucketCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const API = 'https://console.neon.tech/api/v2';
const apiKey = process.env.NEON_API_KEY;
// `npm run storage:preparar -- <project_id> <branch_id>` para no escribirlos en .env.
const proyectoArg = process.argv[2];
const ramaArg = process.argv[3];
const bucket = process.env.MODELOS_BUCKET || 'modelos-ar';
const rutaEnv = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');

if (!apiKey) {
  salir(
    'Falta NEON_API_KEY. Agregala a dizelf_back/.env (Neon Console → perfil → Settings → API keys) y volvé a correr este script.'
  );
}

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...opciones.headers,
    },
  });

  const texto = await respuesta.text();
  let cuerpo = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = { crudo: texto };
  }

  return { ok: respuesta.ok, estado: respuesta.status, cuerpo };
}

async function main() {
  const proyecto = await resolverProyecto(await resolverOrganizacion());
  const rama = await resolverRama(proyecto.id);

  console.log(`Proyecto: ${proyecto.name ?? proyecto.id}`);
  console.log(`Rama:     ${rama.name ?? rama.id} (${rama.id})`);

  // El bucket se crea por la API de Neon (no por S3) para poder fijar el nivel
  // de acceso; por S3 siempre queda privado, que es lo que queremos igual.
  const altaBucket = await api(
    `/projects/${proyecto.id}/branches/${rama.id}/buckets`,
    { method: 'POST', body: JSON.stringify({ name: bucket, access_level: 'private' }) }
  );
  if (altaBucket.ok) {
    console.log(`Bucket "${bucket}" creado.`);
  } else if (/exist/i.test(JSON.stringify(altaBucket.cuerpo))) {
    console.log(`Bucket "${bucket}" ya existía.`);
  } else {
    salir(
      `No se pudo crear el bucket (HTTP ${altaBucket.estado}): ${describir(altaBucket.cuerpo)}`
    );
  }

  const storage = await api(`/projects/${proyecto.id}/branches/${rama.id}/storage`);
  if (!storage.ok || !storage.cuerpo?.s3_endpoint) {
    salir(
      `La rama todavía no expone Object Storage (HTTP ${storage.estado}). Probá de nuevo en unos segundos.`
    );
  }

  const endpoint = storage.cuerpo.s3_endpoint;
  const region = storage.cuerpo.region ?? 'us-east-1';

  let accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? '';
  let secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? '';

  if (!accessKeyId || !secretAccessKey) {
    const credencial = await api(
      `/projects/${proyecto.id}/branches/${rama.id}/credentials`,
      {
        method: 'POST',
        body: JSON.stringify({
          scopes: ['storage:read', 'storage:write'],
          principal_type: 'user',
        }),
      }
    );

    if (!credencial.ok) {
      salir(
        `No se pudo crear la credencial (HTTP ${credencial.estado}): ${describir(credencial.cuerpo)}`
      );
    }

    accessKeyId = credencial.cuerpo.token_id;
    secretAccessKey = credencial.cuerpo.s3_secret_access_key;
    console.log('Credencial S3 creada (el secret quedó escrito en .env).');
  } else {
    console.log('Se reutilizaron las credenciales S3 que ya estaban en .env.');
  }

  escribirEnv({
    MODELOS_BUCKET: bucket,
    AWS_ENDPOINT_URL_S3: endpoint,
    AWS_REGION: region,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
  });

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Región:   ${region}`);
  console.log(`Key ID:   ${accessKeyId.slice(0, 12)}… (completa en .env)`);

  await aplicarCors(endpoint, region, accessKeyId, secretAccessKey);
}

/**
 * La API v2 exige `org_id` para listar proyectos. Con una key personal y una
 * sola organización se resuelve sola; con varias se pide `NEON_ORG_ID` en vez
 * de elegir por el usuario.
 */
async function resolverOrganizacion() {
  if (process.env.NEON_ORG_ID) {
    return process.env.NEON_ORG_ID;
  }

  const respuesta = await api('/users/me/organizations');
  if (!respuesta.ok) {
    salir(
      `La API rechazó la key (HTTP ${respuesta.estado}): ${describir(respuesta.cuerpo)}`
    );
  }

  const organizaciones = respuesta.cuerpo?.organizations ?? [];
  if (organizaciones.length === 1) {
    return organizaciones[0].id;
  }
  if (organizaciones.length === 0) {
    salir('La cuenta no pertenece a ninguna organización de Neon.');
  }

  salir(
    'Hay varias organizaciones. Agregá NEON_ORG_ID=<id> a .env. Opciones:\n' +
      organizaciones.map((org) => `  - ${org.id}  ${org.name ?? ''}`).join('\n')
  );
}

async function resolverProyecto(orgId) {
  const elegido = proyectoArg ?? process.env.NEON_PROJECT_ID;
  if (elegido) {
    const detalle = await api(`/projects/${elegido}`);
    if (!detalle.ok) {
      salir(
        `NEON_PROJECT_ID no se pudo leer (HTTP ${detalle.estado}). Revisá el valor.`
      );
    }
    return detalle.cuerpo.project ?? detalle.cuerpo;
  }

  const lista = await api(`/projects?org_id=${encodeURIComponent(orgId)}`);
  if (!lista.ok) {
    salir(
      `La API rechazó la key (HTTP ${lista.estado}). Copiala de nuevo desde Neon Console → Settings → API keys.`
    );
  }

  const proyectos = lista.cuerpo?.projects ?? [];
  if (proyectos.length === 0) {
    salir('La cuenta no tiene proyectos en Neon.');
  }
  if (proyectos.length === 1) {
    return proyectos[0];
  }

  // Con varios proyectos no se adivina: se pide el ID explícito.
  salir(
    `Hay ${proyectos.length} proyectos. Agregá NEON_PROJECT_ID=<id> a .env. Opciones:\n` +
      proyectos.map((p) => `  - ${p.id}  ${p.name ?? ''}`).join('\n')
  );
}

async function resolverRama(proyectoId) {
  const lista = await api(`/projects/${proyectoId}/branches`);
  if (!lista.ok) {
    salir(`No se pudieron listar las ramas (HTTP ${lista.estado}).`);
  }

  const ramas = lista.cuerpo?.branches ?? [];
  const buscado = ramaArg ?? process.env.NEON_BRANCH_ID;
  const elegida = buscado
    ? ramas.find((rama) => rama.id === buscado)
    : ramas.find((rama) => rama.default);

  if (!elegida) {
    salir(
      `No encontré la rama. Ramas disponibles:\n` +
        ramas.map((rama) => `  - ${rama.id}  ${rama.name}`).join('\n') +
        '\nAgregá NEON_BRANCH_ID=<id> a .env si querés usar otra.'
    );
  }

  return elegida;
}

async function aplicarCors(endpoint, region, accessKeyId, secretAccessKey) {
  const origenes = [
    ...new Set(
      `${process.env.FRONTEND_URL || 'http://localhost:3000'},http://localhost:3000`
        .split(',')
        .map((origen) => origen.trim().replace(/\/$/, ''))
        .filter(Boolean)
    ),
  ];

  const cliente = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await cliente.send(new HeadBucketCommand({ Bucket: bucket }));
    await cliente.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: origenes,
              AllowedMethods: ['PUT', 'GET', 'HEAD'],
              AllowedHeaders: ['content-type'],
              ExposeHeaders: ['etag'],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      })
    );

    const actual = await cliente.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log('CORS aplicado para:', origenes.join(', '));
    console.log(JSON.stringify(actual.CORSRules, null, 2));
    console.log('\nListo: el botón de AR del editor ya puede subir modelos.');
  } catch (error) {
    salir(
      `El bucket existe pero falló S3/CORS: ${error.message}\n` +
        'Si dice AccessDenied, la credencial no tiene storage:write. Borrá AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY de .env y volvé a correr.'
    );
  }
}

/** Actualiza claves del .env conservando comentarios y el resto de las líneas. */
function escribirEnv(valores) {
  const original = (() => {
    try {
      return readFileSync(rutaEnv, 'utf8');
    } catch {
      salir(
        `No encontré ${rutaEnv}. Creá el archivo con NEON_API_KEY=... y volvé a correr.`
      );
    }
  })();

  const pendientes = new Map(Object.entries(valores));
  const lineas = original.split('\n').map((linea) => {
    const coincidencia = linea.match(/^([A-Z0-9_]+)=/);
    if (coincidencia && pendientes.has(coincidencia[1])) {
      const clave = coincidencia[1];
      const valor = pendientes.get(clave);
      pendientes.delete(clave);
      return `${clave}=${valor}`;
    }
    return linea;
  });

  // Las claves que no existían se agregan al final, con un encabezado legible.
  if (pendientes.size > 0) {
    if (lineas[lineas.length - 1]?.trim() !== '') {
      lineas.push('');
    }
    lineas.push('# Object Storage (Neon) — generado por storage:preparar');
    for (const [clave, valor] of pendientes) {
      lineas.push(`${clave}=${valor}`);
    }
    lineas.push('');
  }

  writeFileSync(rutaEnv, lineas.join('\n'), 'utf8');
  console.log(`.env actualizado (${Object.keys(valores).join(', ')}).`);
}

function describir(cuerpo) {
  return cuerpo?.message ?? cuerpo?.crudo ?? JSON.stringify(cuerpo ?? {});
}

function salir(mensaje) {
  console.error(`\n${mensaje}\n`);
  process.exit(1);
}

main().catch((error) => salir(`Error inesperado: ${error.message}`));
