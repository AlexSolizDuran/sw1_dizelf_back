/**
 * Prepara el bucket de modelos AR en Neon Object Storage.
 *
 * Hace dos cosas, ambas idempotentes:
 *   1. Crea el bucket si no existe.
 *   2. Deja la regla CORS que el navegador necesita para el `PUT` prefirmado y
 *      para seguir el 302 de lectura.
 *
 * Uso:
 *   npm run storage:setup
 *   FRONTEND_URL=https://dizelf.vercel.app npm run storage:setup
 *
 * Requiere MODELOS_BUCKET, AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY y AWS_REGION en el entorno (`neon env pull`).
 */
import {
  CreateBucketCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const bucket = process.env.MODELOS_BUCKET || 'modelos-ar';
const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const region = process.env.AWS_REGION || 'us-east-2';

if (!endpoint || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error(
    'Faltan credenciales de Object Storage. Exportá AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY (los da `neon env pull`).',
  );
  process.exit(1);
}

// Los orígenes del front: el de FRONTEND_URL (puede ser lista con comas) más
// localhost, que hace falta para probar en desarrollo.
const origenes = [
  ...new Set(
    `${process.env.FRONTEND_URL || 'http://localhost:3000'},http://localhost:3000`
      .split(',')
      .map((origen) => origen.trim().replace(/\/$/, ''))
      .filter(Boolean),
  ),
];

const cliente = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function main() {
  try {
    await cliente.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket ${bucket} ya existe.`);
  } catch {
    await cliente.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Bucket ${bucket} creado.`);
  }

  await cliente.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origenes,
            // PUT: subida prefirmada. GET/HEAD: lectura del GLB por la AR.
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedHeaders: ['content-type'],
            ExposeHeaders: ['etag'],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );

  const actual = await cliente.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log('CORS configurado:', JSON.stringify(actual.CORSRules, null, 2));
}

main().catch((error) => {
  console.error('No se pudo preparar el bucket:', error.message);
  process.exit(1);
});
