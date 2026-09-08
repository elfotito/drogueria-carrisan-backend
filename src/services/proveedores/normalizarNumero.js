// src/services/proveedores/normalizarNumero.js
// Normaliza un número leído de Excel según el formato decimal del proveedor.
// - 'puntoDecimal': '10.11' o '1,234.56' -> 10.11 (notación anglosajona)
// - 'comaDecimal':  '16,11' -> 16.11 (notación venezolana/latina)
// Ignora texto basura (Bs.S, $, espacios, etc.) y devuelve null si no es numérico.

export function normalizarNumero(valor, formato) {
  if (valor == null) return null;
  let s = String(valor).trim();
  if (s === '') return null;
  // Si ya es número puro (viene como float de xlsx), devolver directo
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return valor > 0 ? valor : null;
  }

  if (formato === 'comaDecimal') {
    // 'Bs.S 11.886,68' -> quitar 'Bs.S' y espacios; '16,11' -> '16.11'
    s = s.replace(/bs\.?\s*s\.?/gi, '').trim();
    s = s.replace(/\./g, '');          // separador de miles
    s = s.replace(/,/g, '.');          // coma decimal -> punto
  } else {
    // puntoDecimal: quitar 'Bs.S', '$' y separadores de miles
    s = s.replace(/bs\.?\s*s\.?/gi, '').replace(/\$/g, '').trim();
    s = s.replace(/[,'"`]/g, '');
  }
  // Quitar cualquier carácter no numérico excepto punto/guion
  s = s.replace(/[^0-9.\-]/g, '');
  if (s === '' || s === '.' || s === '-') return null;

  // Evitar múltiples puntos (miles sin separador) limitando a un decimal
  const partes = s.split('.');
  if (partes.length > 2) {
    s = partes[0] + '.' + partes.slice(1).join('');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? n : null;
}

export default normalizarNumero;
