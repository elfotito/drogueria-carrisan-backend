// src/services/proveedores/drovencentroParser.js
// Parser + matching para el proveedor Drovencentro.
// El .XLS tiene: cabecera en fila 9, datos desde fila 10.
// Columnas (1-indexadas):
//   1 CÓDIGO BARRA (EAN) | 2 DESCRIPCIÓN | 3 LABORATORIO | 4 PRECIO BSS (ignorar)
//   5 PRECION USD | 6 DESCUENTO | 7 NETO BSS (ignorar) | 8 NETO USD (costo)
//   9 DISPONIBLE | 10 IVA | 11 CÓDIGO INTERNO | 12 PRINCIPIO ACTIVO | ...
//
// Enlazado: más concreto que COBECA porque LABORATORIO coincide directo con
// productos.laboratorio (ya corregido a fabricante real) y PRINCIPIO ACTIVO
// matchea contra productos.molecula. Se prioriza por laboratorio, luego por
// molécula, luego nombre. Funciones puras para testear sin BD.

import { normalizar, tokenSim } from '../../../scripts/lib/cobecaParser.mjs';

// Índice de laboratorio normalizado -> lista de productos DB con ese laboratorio.
export function construirIndiceLaboratorio(productos) {
  const idx = new Map();
  for (const p of productos) {
    const lab = normalizar(p.laboratorio || '');
    if (!lab) continue;
    if (!idx.has(lab)) idx.set(lab, []);
    idx.get(lab).push(p);
  }
  return idx;
}

// Tokens de molécula de un texto (principio activo o nombre): palabras >= 3,
// que no sean números sueltos ni unidades.
function tokensMolecula(texto) {
  return normalizar(texto || '')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^\d/.test(t) && !/^(mg|ml|g|ug|iu|mcg|ui|un|%|unidades?)$/.test(t));
}

// Score 0..1 de coincidencia de molécula entre el principio activo del
// proveedor y el producto DB (usa molecula y nombre_comercial).
export function scoreMolecula(principioActivo, productoDb) {
  const tokProv = tokensMolecula(principioActivo);
  if (tokProv.length === 0) return 0;
  const textoDb = normalizar(`${productoDb.molecula || ''} ${productoDb.nombre_comercial || ''}`);
  const tokDb = textoDb.split(/\s+/).filter((t) => t.length >= 3);

  let aciertos = 0;
  for (const t of tokProv) {
    let mejor = 0;
    for (const td of tokDb) {
      const s = tokenSim(t, td);
      if (s > mejor) mejor = s;
    }
    aciertos += mejor;
  }
  return aciertos / tokProv.length;
}

// Score 0..1 de similitud del nombre comercial (marca + presentación).
export function scoreNombre(descripcion, productoDb) {
  const a = normalizar(descripcion || '');
  const b = normalizar(productoDb.nombre_comercial || '');
  if (!a || !b) return 0;
  const tokA = a.split(/\s+/);
  const tokB = b.split(/\s+/);
  let aciertos = 0;
  for (const t of tokA) {
    let mejor = 0;
    for (const td of tokB) {
      const s = tokenSim(t, td);
      if (s > mejor) mejor = s;
    }
    aciertos += mejor;
  }
  return aciertos / tokA.length;
}

// Extrae el primer número de dosis (mg/ml/mcg) de un texto. Ej: 'ATOMOXETINA 10MG' -> 10.
function extraerDosis(texto) {
  const m = String(texto || '').match(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|ml|g|ug|ui|iu)/i);
  if (m) return parseFloat(m[1].replace(',', '.'));
  return null;
}

// 0..1 si la dosis del principio activo coincide con la del producto BD.
// Si ambos tienen dosis legible y difieren -> penaliza (0). Si no se puede
// extraer en alguno -> 0.5 (neutro, no penaliza).
export function scoreConcentracion(principioActivo, productoDb) {
  const dosisProv = extraerDosis(principioActivo);
  const dosisDb = extraerDosis(`${productoDb.molecula || ''} ${productoDb.nombre_comercial || ''}`);
  if (dosisProv != null && dosisDb != null) return dosisProv === dosisDb ? 1 : 0;
  return 0.5;
}

// Match completo Drovencentro: dado una fila y el índice de laboratorio, devuelve
// el mejor candidato producto DB o null. Umbrales:
// - Debe coincidir el laboratorio (normalizado).
// - scoreMolecula >= UMBRAL_MOL, scoreNombre >= UMBRAL_NOM y scoreConcentracion
//   (si ambos tienen dosis y difieren -> sin match).
export function matchDrovencentro(fila, idxLab, umbralMol = 0.6, umbralNom = 0.35) {
  const lab = normalizar(fila.laboratorio || '');
  const candidatos = lab ? idxLab.get(lab) : undefined;
  if (!candidatos || candidatos.length === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const p of candidatos) {
    const sMol = scoreMolecula(fila.principioActivo || fila.descripcion, p);
    if (sMol < umbralMol) continue;
    const sNom = scoreNombre(fila.descripcion, p);
    if (sNom < umbralNom) continue;
    const sConc = scoreConcentracion(fila.principioActivo, p);
    if (sConc === 0) continue; // dosis legibles y distintas -> no es el mismo producto
    // Combinar: molécula + concentración + nombre
    const total = sMol * 0.5 + sConc * 0.3 + sNom * 0.2;
    if (total > bestScore) {
      bestScore = total;
      best = p;
    }
  }
  return best ? { producto: best, score: bestScore } : null;
}

export default {
  construirIndiceLaboratorio,
  scoreMolecula,
  scoreNombre,
  scoreConcentracion,
  matchDrovencentro,
};
