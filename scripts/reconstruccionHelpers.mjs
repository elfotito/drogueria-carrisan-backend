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

// --- Pulido de nombres comerciales (nombre INHRR -> "BASE X n FORMA") ---
// La cola del nombre del registro termina en la forma farmacéutica
// ("AFLAMAX 50 mg TABLETAS RECUBIERTAS"). Al construir la presentación el
// nombre pasaba a duplicar la forma ("... X 10 tabletas"). Ahora se "despega"
// la frase de forma del final y se vuelve a mostrar con mayúsculas en el
// sufijo "X {n} {FORMA}". Los INYECTABLE (incluido liofilizado para
// inyectable) muestran "AMPOLLAS" hasta que el dueño ubique FRASCO AMPOLLA.

// Token final "fuerte"(forma inequívoca). La última palabra del nombre tiene
// que ser una de estas para que el strip arranque (evita quitar "DE"/"PARA"
// sueltos o palabras de marca).
const FORMA_FUERTE = new Set([
  'tabletas', 'tableta', 'tab', 'tabs', 'tbl',
  'comprimidos', 'comprimido',
  'capsulas', 'capsula', 'caps', 'cap',
  'grageas', 'gragea', 'grajeas',
  'ovulos', 'ovulo', 'supositorios', 'supositorio',
  'jarabe', 'jarabes', 'crema', 'cremas', 'gel', 'geles',
  'locion', 'lociones', 'unguento', 'unguentos', 'pomada', 'pomadas',
  'champu', 'champus',
  'solucion', 'suspension',
  'inyectable', 'inyectables',
  'gotas', 'gota',
  'granulado', 'granulados', 'granulos', 'granulo',
  'polvo', 'polvos', 'liofilizado', 'liofilizados',
  'inhalacion', 'inhalaciones', 'nebulizacion', 'nebulizar',
  'aerosol', 'aerosoles', 'spray', 'sprays', 'vapor', 'vapores',
  'vial', 'viales', 'ampolla', 'ampollas', 'frasco', 'frascos',
  'pastillas', 'pastilla', 'sobres', 'sachet', 'sachets',
  'jeringa', 'jeringas', 'prellenada', 'prellenadas',
  'infusion', 'infusiones',
  'recubierta', 'recubiertas', 'recubierto', 'recubiertos',
]);

// Tokens que pueden continuar el strip hacia la izquierda (calificadores de
// forma, "PARA SOLUCION ORAL", "SABOR A LIMON", ...). Incluye los fuertes.
const FORMA_CONTINUA = new Set([
  ...FORMA_FUERTE,
  'recubierta', 'recubiertas', 'recubierto', 'recubiertos', 'revestida', 'revestidas',
  'masticable', 'masticables', 'efervescente', 'efervescentes', 'dispersable', 'dispersables',
  'blanda', 'blandas', 'duro', 'duros', 'dura', 'duras',
  'enterico', 'entericos', 'enterica', 'entericas', 'cubierta', 'cubiertas',
  'gastroresistente', 'gastroresistentes',
  'gastrorresistente', 'gastrorresistentes',
  'microgranulos', 'granulos', 'recubrimiento',
  'liberacion', 'accion', 'prolongada', 'prolongado', 'extendida', 'extendido',
  'sostenida', 'sostenido', 'retardada', 'retardado', 'retardadas', 'controlada', 'controlado',
  'orodispersable', 'orodispersables',
  'vaginal', 'vaginales', 'nasal', 'nasales', 'oral', 'orales', 'bucal', 'bucales',
  'sublingual', 'sublinguales', 'linguales',
  'topica', 'topicas', 'oftalmica', 'oftalmico', 'oftalmicas', 'otica', 'oticas',
  'parenteral', 'parenterales', 'intravenosa', 'intravenoso', 'intravenosas',
  'reconstituccion', 'reconstituidos',
  // Colas del registro a veces vienen truncadas: "... TABLETAS RE",
  // "... TABLETAS RECUB", "... COMP RECUBIERTOS". Son sufijos de forma, NO
  // palabra de marca, así que se admiten como continuación.
  're', 'rec', 'recu', 'recub', 'comp',
  'para', 'por', 'de', 'a', 'en', 'con', 'y', 'o', 'e', 'sin',
  'sabor', 'sabores', 'limon', 'lima', 'menta', 'coco', 'naranja', 'uva', 'fresa',
  'cereza', 'pina', 'mango', 'manzana', 'banana', 'mandarina', 'anana', 'chicle', 'mora',
  'tutti', 'frutti', 'miel', 'vainilla', 'chocolate',
  'a.p.', 'a.p', 'ap',
]);

const DASHES = new Set(['-', '–', '—']);

function normToken(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Despega la frase de forma del final del nombre. Devuelve { base, frase }
// donde `frase` es lo quitado (case original) o null si no hubo coincidencia.
export function quitarForma(nombre) {
  const s = String(nombre ?? '').trim();
  const partes = s.split(/\s+/);
  if (partes.length < 2) return { base: s, frase: null };
  let i = partes.length;
  let fuerte = false;
  for (; i > 0; i--) {
    const raw = partes[i - 1];
    if (DASHES.has(raw)) continue;
    const t = normToken(raw).replace(/[.,;:]+$/, '');
    if (FORMA_CONTINUA.has(t)) {
      if (FORMA_FUERTE.has(t)) fuerte = true;
      continue;
    }
    // Token compuesto por guion con todas sus partes de forma
    // ("DISPERSABLES-MASTICABLES").
    if (raw.includes('-')) {
      const pedazos = raw.split('-').map((p) => normToken(p).replace(/[.,;:]+$/, ''));
      if (pedazos.length >= 2 && pedazos.every((p) => FORMA_CONTINUA.has(p))) {
        if (pedazos.some((p) => FORMA_FUERTE.has(p))) fuerte = true;
        continue;
      }
    }
    break;
  }
  if (!fuerte || i >= partes.length) return { base: s, frase: null };
  const frase = partes.slice(i).join(' ');
  const base = partes.slice(0, i).join(' ').trim();
  if (!base || base === s) return { base: s, frase: null };
  return { base, frase };
}

// Decide la frase visible en "X {n} {FORMA}". Los INYECTABLE (incluido
// liofilizado para inyectable y jeringas prellenadas) van como AMPOLLAS.
export function mostrarForma(frase, forma) {
  const t = normToken(`${frase ?? ''} ${forma ?? ''}`);
  if (/\binyectable\b|\bliofilizado\b|\bjeringa\b|\bprellenad\b/.test(t)) return 'AMPOLLAS';
  return (frase && frase.trim()) || forma || 'UNIDADES';
}

// Arma el nombre comercial y la columna presentacion para una presentación.
export function armarNombrePresentacion(nombre, forma, unidades) {
  if (unidades == null) return { nombre: String(nombre ?? ''), presentacion: null, base: String(nombre ?? ''), frase: null, limpio: true };
  const { base, frase } = quitarForma(nombre);
  const display = mostrarForma(frase, forma);
  const presentacion = display ? `X ${unidades} ${display}` : null;
  return {
    nombre: base + (presentacion ? ' ' + presentacion : ''),
    presentacion,
    base,
    frase,
    limpio: !!frase,
  };
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