export class UrlModeloDto {
  /** URL prefirmada de `PutObject`; el navegador sube ahí, no a la API. */
  url: string;

  /** Clave del objeto. Se devuelve al confirmar para que el backend lo verifique. */
  clave: string;

  /** Segundos de validez de la URL. */
  expiraEnSegundos: number;
}
