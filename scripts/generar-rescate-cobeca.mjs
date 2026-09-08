// scripts/generar-rescate-cobeca.mjs
// Genera los CSVs de rescate de sin-registro COBECA vía Drovencentro:
//   - data/cobeca_rescate_productos_existentes_<fecha>.csv — filas cuyo Drovencentro
//     ya enlazó un registro INHRR (solo aportan costo a productos existentes).
//   - data/cobeca_rescate_nuevos_<fecha>.csv — enlaces nuevos propuestos (requieren
//     revisión del dueño: anti-aceptada se aplica guardándola como
//     data/cobeca_rescate_aprobados.csv). Solo lee, NO toca la BD.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  leerFilasCOBECA,
  leerFilasDrovencentro,
  enlazarCOBECA,
  enlazarDrovencentro,
} from '../src/services/proveedores/importarProveedor.js';
import { construirIndice } from './lib/cobecaParser.mjs';
import { construirIndiceLaboratorio } from '../src/services/proveedores/drovencentroParser.js';
import {
  construirIndiceMolecula,
  rescatarCobeca,
} from './rescateCobeca.mjs';
import PROVEEDORES from '../src/config/proveedores.js';
import { normalizarNumero } from '../src/services/proveedores/normalizarNumero.js';

const DIR_DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

const DB_CONFIG = {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function main() {
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  try {
    const { rows: catalogo } = await client.query(
      'SELECT id, ef, nombre, principio_activo, forma, laboratorio FROM public.productos_catalogo WHERE activo ORDER BY id'
    );
    console.log(`→ ${catalogo.length} registros INHRR activos`);
    const dbShape = catalogo.map((r) => ({
      id: r.id, nombre_comercial: r.nombre, molecula: r.principio_activo || '',
      forma: r.forma || '', laboratorio: r.laboratorio || '', ef: r.ef,
    }));
    const idxCobeca = construirIndice(dbShape);
    const idxLab = construirIndiceLaboratorio(dbShape);
    const idxMol = construirIndiceMolecula(dbShape);

    const filasC = leerFilasCOBECA(fs.readFileSync(path.join(DIR_DATA, 'inventario-cobeca.xlsx')));
    const filasD = leerFilasDrovencentro(fs.readFileSync(path.join(DIR_DATA, 'inventario-drovencentro.XLS')));

    const drovenRows = filasD.map((f) => ({ f, e: enlazarDrovencentro(f, idxLab) }));
    console.log(`→ drovencentro: ${filasD.length} filas`);

    const fmt = PROVEEDORES.cobeca.formatoNumero;
    const existentes = [];
    const nuevos = [];
    let sinRescate = 0;
    for (const f of filasC) {
      const desc = (f.desc || f.descripcion || '').trim();
      const costo = normalizarNumero(f.costoRaw, fmt);
      if (!desc || costo == null) continue;
      const e = enlazarCOBECA(f, dbShape, idxCobeca);
      if (e.estado === 'matched' || e.estado === 'no_farmaco') continue;
      const r = rescatarCobeca({ desc, costo, drovenRows, dbShape, idxMol });
      if (!r) { sinRescate++; continue; }
      const costoStr = Number(costo.toFixed(2)).toFixed(2);
      const fila = [csvEscape(desc), costoStr, r.ef, csvEscape(r.filaDroven.principioActivo || ''), (+r.score).toFixed(3)];
      if (r.camino === 'aCostoExistente') existentes.push(fila);
      else if (r.camino === 'nuevoEnlace') nuevos.push(fila);
    }

    const fecha = new Date().toISOString().slice(0, 10);
    const header = ['descripcion', 'costo_usd', 'ef', 'pa_drovencentro', 'score'];
    const csvExistentes = [header.join(',')].concat(existentes.map((r) => r.join(','))).join('\n');
    const csvNuevos = [header.join(',')].concat(nuevos.map((r) => r.join(','))).join('\n');
    fs.writeFileSync(path.join(DIR_DATA, `cobeca_rescate_productos_existentes_${fecha}.csv`), csvExistentes);
    fs.writeFileSync(path.join(DIR_DATA, `cobeca_rescate_nuevos_${fecha}.csv`), csvNuevos);

    console.log(`COBECA sin-registro rescatables: existentes=${existentes.length}, nuevos=${nuevos.length}, sin_rescate=${sinRescate}`);
    console.log(`CSV: data/cobeca_rescate_productos_existentes_${fecha}.csv`);
    console.log(`CSV: data/cobeca_rescate_nuevos_${fecha}.csv`);
    console.log(`\nPARA APROBAR los ${nuevos.length} enlaces nuevos:`);
    console.log(`  1. Abre data/cobeca_rescate_nuevos_${fecha}.csv`);
    console.log(`  2. Elimina las filas que NO quieras aplicar`);
    console.log(`  3. Guarda el resultado como data/cobeca_rescate_aprobados.csv (con la misma cabecera)`);
    console.log(`  4. Re-corre: node scripts/reconstruir-catalogo.mjs`);
  } finally {
    await client.end().catch(() => {});
  }
}

main();