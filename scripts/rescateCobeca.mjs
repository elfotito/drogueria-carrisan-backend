// scripts/rescateCobeca.mjs
// Rescate de sin-registro COBECA cruzando marca+dosis contra Drovencentro,
// que lleva columna PRINCIPIO ACTIVO. Funciones puras (testeables sin BD).
import { normalizar } from './lib/cobecaParser.mjs';
import {
  scoreMolecula,
  scoreNombre,
  scoreConcentracion,
} from '../src/services/proveedores/drovencentroParser.js';

// Primera palabra alfabética >= 3 caracteres de una descripción (marca).
export function marcaDeDesc(desc) {
  return (normalizar(desc || '').split(/\s+/).find((t) => /^[a-z]{3,}$/.test(t)) || null);
}

// Primer número con unidad (mg/ml/mcg/g) de un texto. Ej: 'ATOMOXETINA 10MG 10CAPS' -> 10.
export function extraerDosis(texto) {
  const m = String(texto || '').match(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|ml|g|ug|ui|iu)/i);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// Índice token de molécula (principio_activo del catalogo INHRR) para candidatos rápidos.
export function construirIndiceMolecula(dbShape) {
  const idx = new Map();
  for (const p of dbShape) {
    for (const t of normalizar(p.molecula || '').split(/\s+/).filter((t) => t.length >= 4)) {
      if (!idx.has(t)) idx.set(t, []);
      idx.get(t).push(p);
    }
  }
  return idx;
}

function candidatosPorMolecula(pa, idxMol) {
  const seen = new Set();
  const out = [];
  for (const t of normalizar(pa || '').split(/\s+/).filter((t) => t.length >= 4)) {
    for (const p of idxMol.get(t) || []) {
      if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
    }
  }
  return out;
}

// Mejor candidato INHRR para una fila COBECA sin-registro (PA de Drovencentro +
// descripción COBECA), por score combinado: 0.7*scoreMolecula + 0.3*scoreNombre.
// El score por molécula acierta con CUALQUIER componente compartido (p.ej. PA
// 'MONTELUKAST 50MG' da 1.0 contra 'Airon Duo' DESLORATADINA-MONTELUKAST o
// 'ACEITE DE HIGADO' contra LANOLZINC) -> el nombre comercial desambigua.
// La dosis del PA a veces está mal (AIRON PED 5MG con PA 'MONTELUKAST 50MG'), así
// que la validación de concentración del PA se aplica SOLO si la descripción COBECA
// no trae dosis propia (la descripción es la fuente de la dosis real).
export function candidatoNuevoEnlace(pa, desc, dbShape, idxMol, umbral = 0.72) {
  const descDosis = extraerDosis(desc);
  let best = null;
  let bs = 0;
  let bestMol = 0;
  let bestNom = 0;
  for (const p of candidatosPorMolecula(pa, idxMol)) {
    if (descDosis == null && scoreConcentracion(pa, p) === 0) continue;
    const sMol = scoreMolecula(pa, p);
    if (sMol < 0.5) continue;
    const sNom = scoreNombre(desc, p);
    // Los registros de COMBINACIÓN (molecula con ' - ', ej. 'OXIDO DE ZINC -
    // ACEITE DE HIGADO DE BACALAO' o 'DESLORATADINA - MONTELUKAST') aciertan con
    // CUALQUIER componente compartido del PA; si además el nombre comercial no se
    // parece al de la descripción COBECA, es un componente accidental -> lo más
    // probable es que el producto real ni exista en el catalogo. Exigir nombre.
    if (p.molecula && p.molecula.includes(' - ') && sNom < 0.25) continue;
    const total = sMol * 0.7 + sNom * 0.3;
    if (total > bs) { bs = total; best = p; bestMol = sMol; bestNom = sNom; }
  }
  return best && bs >= umbral ? { producto: best, score: bs, scoreMol: bestMol, scoreNom: bestNom } : null;
}

// Empareja una fila COBECA sin-registro con filas Drovencentro por marca + dosis,
// eligiendo la de mejor similitud de nombre.
export function emparejarConDroven(descCobeca, drovenRows) {
  const m = marcaDeDesc(descCobeca);
  if (!m) return null;
  const dosis = extraerDosis(descCobeca);
  let best = null;
  let bs = -1;
  for (const r of drovenRows) {
    if (marcaDeDesc(r.f.descripcion) !== m) continue;
    const rDosis = extraerDosis(r.f.descripcion);
    if (!((dosis == null && rDosis == null) || (dosis != null && dosis === rDosis))) continue;
    const s = scoreNombre(descCobeca, r.f.descripcion);
    if (s > bs) { bs = s; best = { ...r, score: s }; }
  }
  return best;
}

// ¿La dosis legible de la descripción COBECA coincide con la del producto INHRR?
// Si ambos tienen dosis legible y difieren -> falso (no es el mismo producto).
// La dosis del PA de Drovencentro a veces está mal (ej. AIRON PED 5MG con PA)
// MONTELUKAST 50MG); la descripción COBECA es la fuente de la dosis real.
export function dosisCoincideConProducto(desc, producto) {
  const dDesc = extraerDosis(desc);
  const dProd = extraerDosis(`${producto.molecula || ''} ${producto.nombre_comercial || ''}`);
  if (dDesc != null && dProd != null && dDesc !== dProd) return false;
  return true;
}

// Decide el camino de rescate para una fila COBECA sin-registro:
//   'aCostoExistente' -> su Drovencentro ya enlazó el ef (aplica el costo a ese producto).
//   'nuevoEnlace'     -> el PA de Drovencentro enlaza un ef nuevo (requiere aprobación).
//   null              -> sin rescate (marca o PA no dan candidato fiable).
// El camino "aCostoExistente" hereda el enlace de Drovencentro, que puede estar mal
// (ej. Airon Duo enlazado por PA 'MONTELUKAST 50MG' pero desc dice '5MG'): se exige
// además una similitud mínima de nombre comercial con la descripción COBECA; si no
// supera el piso, se intenta el enlace por PA con score combinado.
export function rescatarCobeca({ desc, costo, drovenRows, dbShape, idxMol, umbral = 0.72 }) {
  const par = emparejarConDroven(desc, drovenRows);
  if (!par) return null;
  const efHeredado = par.e && par.e.estado === 'matched' ? par.e.producto : null;
  if (efHeredado && dosisCoincideConProducto(desc, efHeredado) && scoreNombre(desc, efHeredado) >= 0.25) {
    return { camino: 'aCostoExistente', filaDroven: par.f, ef: efHeredado.ef, score: par.score };
  }
  const pa = (par.f.principioActivo || '').trim();
  if (pa.length < 4) return null;
  const ne = candidatoNuevoEnlace(pa, desc, dbShape, idxMol, umbral);
  if (ne && dosisCoincideConProducto(desc, ne.producto)) {
    return { camino: 'nuevoEnlace', filaDroven: par.f, ef: ne.producto.ef, score: ne.score };
  }
  return null;
}