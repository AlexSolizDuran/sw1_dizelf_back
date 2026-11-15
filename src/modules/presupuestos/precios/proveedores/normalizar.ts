/**
 * Normaliza para comparar nombres de producto: minúsculas, sin acentos y sin
 * espacios repetidos. "Cerámica  Piso" y "ceramica piso" son el mismo texto a
 * efectos de buscar, pero no se comparan por parecido: el catálogo exige que el
 * nombre contenga el texto completo de la ficha.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
