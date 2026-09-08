// scripts/reconstruccionHelpers.mjs
// Helpers puros para la reconstrucción del catálogo (pack, SKU, presentación).
// Sin imports de BD — testeables con node:test.
//
// Nota de diseño del detector de packs:
// - COBECA: el pack es 'X<n>' en cualquier parte de la descripción (p.ej.
//   "AC FOLICO TAB 5MG X10 BIOQ" — el laboratorio va después). Se bloquea el
//   caso 'X 5 ML' (volumen por unidad) con un lookahead que descarta unidades
//   de dosis/volumen.
// - Drovencentro: el pack es 'nCAPS/nTABS/...' (p.ej. "10CAPS"). SOLO se
//   cuentan CAPS/CAP/TABS/TAB/TBL/SOB/AMP/VIAL: ML/G/MG son dosis, no pack
//   ("ATOMOXETINA 10MG" no es un pack de 10). Se toma la ÚLTIMA ocurrencia
//   para tolerar descripciones con el principio activo al final.

const TEXTO_PACK = {
  TAB: 'tabletas', TABS: 'tabletas', TBL: 'tabletas',
  CAP: 'capsulas', CAPS: 'capsulas',
  SOB: 'sobres', AMP: 'ampollas', VIAL: 'viales',
  ML: 'ml', G: 'g', MG: 'mg',
};

// Unidad/dosis que NO debe tratarse como pack cuando sigue a un 'X<n>'
const UNIDADES_NO_PACK = new Set(['ml', 'mg', 'mcg', 'g', 'ug', 'ui', 'iu', '%']);

export function detectarPackCobeca(desc) {
  const m = String(desc || '').match(/\bX\s*(\d+)\b(?!\s*(ml|mg|mcg|g|ug|ui|iu|%))/i);
  if (!m) return null;
  return { unidades: Number.parseInt(m[1], 10) };
}

const PACK_DROVEN = '(\\d+)\\s*(CAPS|CAP|TABS|TAB|TBL|SOB|AMP|VIAL)\\b';
const RE_DROVEN_TRAILING = new RegExp(PACK_DROVEN + '\\s*$', 'i');
const RE_DROVEN_ALL = new RegExp(PACK_DROVEN, 'gi');

export function detectarPackDrovencentro(desc) {
  const s = String(desc || '');
  // Preferir el pack al final de la descripción (formato estándar).
  let m = s.match(RE_DROVEN_TRAILING);
  if (!m) {
    // Fallback: última ocurrencia de 'nCAPS/nTABS/...' en toda la descripción.
    const all = [...s.matchAll(RE_DROVEN_ALL)];
    if (all.length === 0) return null;
    m = all[all.length - 1];
  }
  const key = m[2].toUpperCase();
  return { unidades: Number.parseInt(m[1], 10), texto: TEXTO_PACK[key] || key.toLowerCase() };
}

export function textoPresentacion(unidades, keyPack) {
  const txt = (keyPack || '').toString().toUpperCase();
  return `X ${unidades} ${TEXTO_PACK[txt] || txt.toLowerCase()}`.replace(/\s*$/, '');
}

export function asignarSkus(baseSku, packs) {
  const unicos = [...new Set(packs.map((u) => (u == null ? null : Number(u))))].sort((a, b) => a - b);
  if (unicos.length <= 1) return [{ sku: baseSku, unidades: unicos[0] ?? null }];
  return unicos.map((u, i) => ({ sku: `${baseSku}/${i + 2}`, unidades: u }));
}

// Agrupa matches por ef, dedupe por unidades (un pack = un producto), con MIN
// costo por proveedor dentro de la misma presentación. Conserva clavePack
// (texto de la presentación detectado del proveedor) para construir el nombre
// comercial en la reconstrucción.
export function packsUnicosPorEf(matches) {
  const map = new Map();
  for (const m of matches) {
    if (!map.has(m.ef)) map.set(m.ef, new Map());
    const inner = map.get(m.ef);
    const key = `${m.unidades ?? 'null'}`;
    if (!inner.has(key)) {
      inner.set(key, { unidades: m.unidades ?? null, costoPorProveedor: {}, clavePack: m.clavePack ?? null });
    } else if (m.clavePack && !inner.get(key).clavePack) {
      inner.get(key).clavePack = m.clavePack;
    }
    const entry = inner.get(key);
    const prev = entry.costoPorProveedor[m.proveedor];
    if (prev == null || m.costo < prev) entry.costoPorProveedor[m.proveedor] = m.costo;
  }
  for (const [ef, inner] of map) map.set(ef, [...inner.values()]);
  return map;
}