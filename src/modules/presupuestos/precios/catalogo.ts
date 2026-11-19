import type { FichaCatalogo, FichaManual } from './tipos';

/**
 * Catálogo de materiales con precio resoluble, mapeado a las tiendas reales.
 *
 * OPCIÓN MÍNIMA: este mapa es CÓDIGO, no tabla. Corregir un mapeo exige un
 * deploy, a cambio de no mantener `catalogo_material` + `mapeo_proveedor_material`
 * + `precio_observacion` (ver `informes/presupuesto-base-datos.md`).
 *
 * REGLAS DE ESTE ARCHIVO
 * ----------------------
 * 1. Solo entra un material cuya presentación sea inequívoca ("bolsa 50 kg",
 *    "pieza", "barra 9 m"). Por eso no hay cerámica ni porcelanato: el precio
 *    publicado puede ser por pieza, por caja o por m², y adivinarlo produce
 *    presupuestos con error de 10×.
 * 2. Nada de equivalencias por parecido: o hay SKU exacto, o hay un texto del
 *    nombre que identifique el producto. Si no, el material queda manual.
 * 3. `rangoSanidad` está en bolivianos y es ancho a propósito: no pretende
 *    fijar el precio de mercado, solo atrapar errores de magnitud (un precio en
 *    centavos, un combo por millar, un producto de muestra).
 * 4. `buscar` es un solo token porque la búsqueda de Constructor Bolivia no
 *    resuelve frases: `?search=acero corrugado 6mm` devuelve vacío.
 *
 * Verificado en vivo (noviembre 2026): los precios que devuelven estas fichas
 * son Bs 79,00 la bolsa de cemento, Bs 1,56 el ladrillo 6H, Bs 16,99 la barra
 * de 6 mm y Bs 443,48 la cerradura Icsa 110/40.
 *
 * `imagen` es la foto del producto en la tienda, sacada de su propio catálogo
 * (WooCommerce `images[0].src` en Constructor Bolivia, `featured_image.url` en
 * Morales). Se guarda la URL del producto que cotiza la ficha, no se busca al
 * vuelo: ver `tipos.ts`. Constructor Bolivia exige un User-Agent de navegador
 * para servir el archivo; un `<img>` del navegador lo manda solo.
 */
export const CATALOGO_PRECIOS: Record<string, FichaCatalogo> = {
  cemento_ip30_50kg: {
    nombre: 'Cemento Portland IP-30 (bolsa 50 kg)',
    categoria: 'MAMPOSTERIA',
    unidadBase: 'bolsa',
    imagen:
      'https://www.constructorbolivia.com/wp-content/uploads/2021/08/cemento-viacha.png',
    candidatos: [
      {
        proveedor: 'constructorbolivia',
        buscar: 'cemento',
        nombreContiene: 'IP30',
        unidadExterna: 'bolsa 50 kg',
        factor: 1,
        rangoSanidad: [30, 130],
      },
    ],
  },

  ladrillo_6h: {
    nombre: 'Ladrillo 6 huecos Incerpaz (24x15x10 cm)',
    categoria: 'MAMPOSTERIA',
    unidadBase: 'pza',
    nota: 'Por pieza, no por millar.',
    imagen:
      'https://www.constructorbolivia.com/wp-content/uploads/2023/07/Inverpaz-1.png',
    candidatos: [
      {
        proveedor: 'constructorbolivia',
        buscar: 'ladrillo',
        sku: '6HER',
        unidadExterna: 'pieza',
        factor: 1,
        rangoSanidad: [0.5, 5],
      },
    ],
  },

  ladrillo_18h: {
    nombre: 'Ladrillo visto 18 huecos Incerpaz',
    categoria: 'MAMPOSTERIA',
    unidadBase: 'pza',
    nota: 'Por pieza, no por millar.',
    imagen:
      'https://www.constructorbolivia.com/wp-content/uploads/2025/11/Ladrillo-visto-de-18-huecos.png',
    candidatos: [
      {
        proveedor: 'constructorbolivia',
        buscar: 'ladrillo',
        sku: '18 H',
        unidadExterna: 'pieza',
        factor: 1,
        rangoSanidad: [0.5, 5],
      },
    ],
  },

  fierro_corrugado_6mm: {
    nombre: 'Acero corrugado 6 mm x 9 m (500S)',
    categoria: 'LOSA',
    unidadBase: 'barra',
    nota: 'Cantidad según cálculo estructural.',
    imagen:
      'https://www.constructorbolivia.com/wp-content/uploads/2021/11/acero-corrugado.jpg',
    candidatos: [
      {
        proveedor: 'constructorbolivia',
        buscar: 'corrugado',
        nombreContiene: 'DN=6mm',
        unidadExterna: 'barra 9 m',
        factor: 1,
        rangoSanidad: [5, 60],
      },
    ],
  },

  cerradura_externa: {
    nombre: 'Cerradura externa Icsa 110/40 niquelada',
    categoria: 'ABERTURA',
    unidadBase: 'pza',
    imagen:
      'https://cdn.shopify.com/s/files/1/0804/3708/4217/files/Disenosintitulo_1.png?v=1784300191',
    candidatos: [
      {
        proveedor: 'morales',
        buscar: 'cerradura externa icsa 110/40',
        nombreContiene: 'Cerradura Externa Niquelada Icsa 110/40',
        unidadExterna: 'pieza',
        factor: 1,
        rangoSanidad: [100, 1500],
      },
    ],
  },
};

/** Claves que el frontend puede pedir. Sirve para advertir temprano. */
export function clavesResolubles(): string[] {
  return Object.keys(CATALOGO_PRECIOS);
}

/**
 * Materiales sin precio online: se presupuestan solo con precio escrito a mano.
 *
 * No están en `CATALOGO_PRECIOS` porque no hay tienda con precio publicable
 * (puertas, ventanas) o la presentación publicada es ambigua (cerámica por caja
 * o por m², pintura por galón o por balde). Inventarles un precio produciría un
 * presupuesto con error de 10×, así que la línea obliga a escribirlo.
 */
export const CATALOGO_MANUALES: Record<string, FichaManual> = {
  puerta_interior: {
    clave: 'puerta_interior',
    nombre: 'Puerta interior (hoja + marco)',
    categoria: 'ABERTURA',
    unidadBase: 'pza',
    nota: 'Precio a mano: escribí el de tu proveedor.',
    imagen: '/materiales/puerta_interior.svg',
  },
  puerta_exterior: {
    clave: 'puerta_exterior',
    nombre: 'Puerta exterior de seguridad',
    categoria: 'ABERTURA',
    unidadBase: 'pza',
    nota: 'Precio a mano: escribí el de tu proveedor.',
    imagen: '/materiales/puerta_exterior.svg',
  },
  ventana_corrediza: {
    clave: 'ventana_corrediza',
    nombre: 'Ventana corrediza de aluminio',
    categoria: 'ABERTURA',
    unidadBase: 'pza',
    nota: 'Precio a mano: según medida.',
    imagen: '/materiales/ventana_corrediza.svg',
  },
  arena_comun: {
    clave: 'arena_comun',
    nombre: 'Arena común',
    categoria: 'MAMPOSTERIA',
    unidadBase: 'm3',
    nota: 'Por m³ o volqueta.',
    imagen: '/materiales/arena_comun.svg',
  },
  grava_triturada: {
    clave: 'grava_triturada',
    nombre: 'Grava triturada',
    categoria: 'HORMIGON',
    unidadBase: 'm3',
    nota: 'Por m³.',
    imagen: '/materiales/grava_triturada.svg',
  },
  alambre_amarre: {
    clave: 'alambre_amarre',
    nombre: 'Alambre de amarre',
    categoria: 'MAMPOSTERIA',
    unidadBase: 'kg',
    nota: 'Por kilo o rollo.',
    imagen: '/materiales/alambre_amarre.svg',
  },
  pintura_latex: {
    clave: 'pintura_latex',
    nombre: 'Pintura látex para interior',
    categoria: 'ACABADO',
    unidadBase: 'gal',
    nota: 'Rinde 8–10 m² por mano por galón.',
    imagen: '/materiales/pintura_latex.svg',
  },
  cielo_raso: {
    clave: 'cielo_raso',
    nombre: 'Cielo raso (yeso o placa)',
    categoria: 'ACABADO',
    unidadBase: 'm2',
    nota: 'Sistema por m²: placa, perfilería y masilla.',
    imagen: '/materiales/cielo_raso.svg',
  },
  ceramica_piso: {
    clave: 'ceramica_piso',
    nombre: 'Cerámica para piso',
    categoria: 'ACABADO',
    unidadBase: 'm2',
    nota: 'Por caja: precio por m².',
    imagen: '/materiales/ceramica_piso.svg',
  },
  porcelanato: {
    clave: 'porcelanato',
    nombre: 'Porcelanato',
    categoria: 'ACABADO',
    unidadBase: 'm2',
    nota: 'Por caja: precio por m².',
    imagen: '/materiales/porcelanato.svg',
  },
};

/**
 * Catálogo que ve el cliente: una sola lista, en este orden.
 *
 * Primero los que tienen precio de tienda (es lo que el usuario puede medir y
 * generar sin tocar nada) y después los manuales. No se expone el mapeo interno
 * (SKU, texto de búsqueda, rango de sanidad): es estrategia de scraping, no
 * información del producto.
 */
export function catalogoPublico(): {
  clave: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precioAutomatico: boolean;
  nota: string | null;
  /** Foto del producto: URL de la tienda, o ruta del `public/` del front. */
  imagen: string | null;
}[] {
  const conPrecio = Object.entries(CATALOGO_PRECIOS).map(([clave, ficha]) => ({
    clave,
    nombre: ficha.nombre,
    categoria: ficha.categoria,
    unidad: ficha.unidadBase,
    precioAutomatico: true,
    nota: ficha.nota ?? null,
    imagen: ficha.imagen ?? null,
  }));

  const manuales = Object.entries(CATALOGO_MANUALES).map(([clave, ficha]) => ({
    clave,
    nombre: ficha.nombre,
    categoria: ficha.categoria,
    unidad: ficha.unidadBase,
    precioAutomatico: false,
    nota: ficha.nota,
    imagen: ficha.imagen,
  }));

  return [...conPrecio, ...manuales];
}
