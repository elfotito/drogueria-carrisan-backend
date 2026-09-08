import { DuckDBInstance } from '@duckdb/node-api';
import * as XLSX from 'xlsx';
import fs from 'fs';

const inst = await DuckDBInstance.create();
const conn = await inst.connect();
await conn.run(`INSTALL excel;`);
await conn.run(`LOAD excel;`);

console.log('========== COBECA: duplicidad de packs ==========');
// normalizar: quitar el pack "X30" y tokens numericos de la descripcion
const q = await conn.runAndReadAll(`
  SELECT
    regexp_replace(regexp_replace(Descripcion, ' X\\d+(/X\\d+)?', '', 'g'), '\\d+(,\\d+)? *', '', 'g') AS base,
    count(DISTINCT regexp_extract(Descripcion, 'X\\d+', 0)) AS n_packs,
    count(*) AS filas,
    list(DISTINCT regexp_extract(Descripcion, 'X\\d+', 0)) AS packs
  FROM read_xlsx('data/inventario-cobeca.xlsx', header=true)
  WHERE regexp_matches(Descripcion, ' X\\d+')
  GROUP BY 1 HAVING count(DISTINCT regexp_extract(Descripcion, 'X\\d+', 0)) > 1
  ORDER BY n_packs DESC, base
`);
const rows = q.getRowObjects();
console.log('productos COBECA con >1 pack en descripcion:', rows.length);
console.log('\nEjemplos (primeros 15):');
for (const r of rows.slice(0, 15)) console.log(`${r.base}  → packs=${r.packs} (${r.filas} filas)`);

const tot = await conn.runAndReadAll(`
  SELECT count(*) AS total, count(DISTINCT regexp_extract(Descripcion, 'X\\d+', 0)) AS packs
  FROM read_xlsx('data/inventario-cobeca.xlsx', header=true)
  WHERE regexp_matches(Descripcion, ' X\\d+')
`);
console.log('\nTotal filas con pack explicito:', tot.getRowObjects()[0].total);

// ===== DROVEN (XLS BIFF via SheetJS) =====
console.log('\n========== DROVEN: estructura ==========');
const wb = XLSX.read(fs.readFileSync('data/inventario-drovencentro.XLS'), { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const refs = XLSX.utils.decode_range(ws['!ref'] || 'A1');
console.log('rango:', ws['!ref'], 'filas:', refs.e.r + 1);
const get = (R, col) => ws[XLSX.utils.encode_cell({ r: R, c: col - 1 })]?.v;

// cabecera en fila real 9 (R8)
console.log('\nCabecera fila real 9:', [1,2,3,8,12].map(c => `col${c}=${JSON.stringify(get(8,c))}`).join(' | '));
console.log('Primera fila datos:', [1,2,3,8,12].map(c => `col${c}=${JSON.stringify(get(9,c))}`).join(' | '));

// contamos productos con variante X en la col descripcion
const mapVariantes = new Map(); // base -> Set(pack)
for (let R = 9; R <= refs.e.r; R++) {
  const d = String(get(R, 2) || '');
  if (!d.trim()) continue;
  const m = d.match(/ X\d+/gi);
  const base = d.replace(/ X\d+(?=\s|$)/gi, '').toUpperCase().trim();
  if (m) {
    const packsSet = mapVariantes.get(base) || new Set();
    m.forEach(pm => packsSet.add(pm.toUpperCase()));
    mapVariantes.set(base, packsSet);
  }
}
let multi = 0;
for (const [base, s] of mapVariantes) if (s.size > 1) multi++;
console.log('\nproductos DROVEN con >1 pack:', multi);
let c = 0;
for (const [base, s] of mapVariantes) {
  if (s.size <= 1) continue;
  console.log(`${base} → packs=${[...s]}`);
  if (++c >= 15) break;
}

await conn.close();