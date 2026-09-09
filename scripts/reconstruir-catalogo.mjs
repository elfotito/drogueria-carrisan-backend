// scripts/reconstruir-catalogo.mjs
// Reconstruye `productos` por presentaciones desde el registro INHRR + excels de
// proveedores (COBECA xlsx + Drovencentro xls). Idempotente: borra primero los
// productos de la corrida previa (fuente_inhrr_ef IS NOT NULL) y re-inserta.
// Uso: node scripts/reconstruir-catalogo.mjs   (requiere .env con SUPABASE_DB_*)
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
import { construirIndice, parsearDescripcion } from './lib/cobecaParser.mjs';
import { construirIndiceLaboratorio } from '../src/services/proveedores/drovencentroParser.js';
import {
  detectarPackCobeca,
  detectarPackDrovencentro,
  textoPresentacion,
  asignarSkus,
  packsUnicosPorEf,
  armarNombrePresentacion,
} from './reconstruccionHelpers.mjs';
import { construirIndiceMolecula, rescatarCobeca } from './rescateCobeca.mjs';
import PROVEEDORES from '../src/config/proveedores.js';
import { normalizarNumero } from '../src/services/proveedores/normalizarNumero.js';

const CHUNK = 500;
const MARGEN = 0.6;
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

// Parse simple de una línea CSV con campos entre comillas (comas internas).
function parseCsvLine(linea) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (q) {
      if (ch === '"') {
        if (linea[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function main() {
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  try {
    // --- Cargan registro INHRR (maestro) ---
    const { rows: catalogo } = await client.query(`
      SELECT id, sku, ef, nombre, forma, categoria, principio_activo, laboratorio, activo
      FROM public.productos_catalogo WHERE activo ORDER BY id
    `);
    console.log(`→ ${catalogo.length} registros INHRR activos`);
    const porEf = new Map(catalogo.map((c) => [c.ef, c]));

    // --- Moléculas por registro (para bridge y columna molecula) ---
    const { rows: puente } = await client.query(`
      SELECT cm.producto_catalogo_id AS pcid, mr.id AS mid, mr.nombre AS nombre
      FROM public.catalogo_moleculas cm
      JOIN public.moleculas_referencias mr ON mr.id = cm.molecula_id
    `);
    const molesPorCatalogo = new Map();
    for (const r of puente) {
      if (!molesPorCatalogo.has(r.pcid)) molesPorCatalogo.set(r.pcid, []);
      molesPorCatalogo.get(r.pcid).push(r);
    }

    // --- Idempotencia: borrar corrida previa (solo lo de este script) ---
    await client.query('BEGIN');
    const del = await client.query(`
      DELETE FROM public.productos WHERE fuente_inhrr_ef IS NOT NULL
    `);
    console.log(`→ eliminados ${del.rowCount} productos de corrida previa`);

    // --- Enlazado: excels contra productos_catalogo ---
    // Shape esperado por los matchers: { id, nombre_comercial, molecula, forma, laboratorio }
    const dbShape = catalogo.map((c) => ({
      id: c.id,
      nombre_comercial: c.nombre,
      molecula: c.principio_activo || '',
      forma: c.forma || '',
      laboratorio: c.laboratorio || '',
      ef: c.ef,
    }));
    const idxCobeca = construirIndice(dbShape);
    const idxDrov = construirIndiceLaboratorio(dbShape);
    const idxMol = construirIndiceMolecula(dbShape);

    const matches = []; // { ef, unidades, clavePack, proveedor, costo, productoIdCat, nombreRegistro, formaRegistro }
    const sinRegistro = []; // fila fármaco sin match -> reporte del dueño
    const rechazados = []; // todas las filas (reporte completo)

    // --- Drovencentro pre-enlazado (se reusa para el rescate de sin-registro COBECA) ---
    const drovenRows = leerFilasDrovencentro(fs.readFileSync(path.join(DIR_DATA, 'inventario-drovencentro.XLS')))
      .map((f) => ({ f, e: enlazarDrovencentro(f, idxDrov) }));
    console.log(`→ drovencentro: ${drovenRows.length} filas (pre-enlazadas)`);

    const rescatadosA = []; // filas COBECA rescatadas a un producto existente (costo adicional)
    const rescatadosNuevos = []; // propuestas de enlace nuevo (se aplican si el dueño las aprueba)

    for (const prov of ['cobeca', 'drovencentro']) {
      if (prov === 'cobeca') {
        const fmt = PROVEEDORES.cobeca.formatoNumero;
        const filas = leerFilasCOBECA(fs.readFileSync(path.join(DIR_DATA, 'inventario-cobeca.xlsx')));
        console.log(`→ leyendo cobeca: ${filas.length} filas`);
        for (const f of filas) {
          const costo = normalizarNumero(f.costoRaw, fmt);
          const desc = (f.descripcion || f.desc || '').trim();
          if (!desc) { rechazados.push({ prov, desc: '(vacía)', costo, estado: 'sin_match', motivo: 'descripcion vacia' }); continue; }
          if (costo == null) { rechazados.push({ prov, desc, costo, estado: 'sin_match', motivo: 'sin costo' }); continue; }
          const e = enlazarCOBECA(f, dbShape, idxCobeca);
          rechazados.push({ prov, desc, costo, ef: e.producto?.ef, estado: e.estado, motivo: e.motivo || (e.estado === 'matched' ? `score=${(+e.score).toFixed(3)}` : '') });
          const pack = detectarPackCobeca(desc);
          const clavePack = parsearDescripcion(desc).forma || null;
          if (e.estado === 'matched') {
            const r = e.producto;
            matches.push({ ef: r.ef, unidades: pack?.unidades ?? null, clavePack, proveedor: 'cobeca', costo: Number(costo.toFixed(2)), productoIdCat: r.id, nombreRegistro: r.nombre_comercial, formaRegistro: r.forma });
          } else if (e.estado !== 'no_farmaco') {
            sinRegistro.push({ prov, desc, costo, motivo: e.motivo || 'sin_candidato' });
            const r = rescatarCobeca({ desc, costo, drovenRows, dbShape, idxMol });
            if (r?.camino === 'aCostoExistente') {
              const reg = porEf.get(r.ef);
              if (reg) {
                matches.push({ ef: r.ef, unidades: pack?.unidades ?? null, clavePack, proveedor: 'cobeca', costo: Number(costo.toFixed(2)), productoIdCat: reg.id, nombreRegistro: reg.nombre, formaRegistro: reg.forma, rescatado: true });
                rescatadosA.push({ desc, ef: r.ef, costo: Number(costo.toFixed(2)), score: r.score });
              }
            } else if (r?.camino === 'nuevoEnlace') {
              rescatadosNuevos.push({ desc, ef: r.ef, costo: Number(costo.toFixed(2)), score: r.score });
            }
          }
        }
      } else {
        const fmt = PROVEEDORES.drovencentro.formatoNumero;
        for (const { f, e } of drovenRows) {
          const costo = normalizarNumero(f.costoRaw, fmt);
          const desc = (f.descripcion || f.desc || '').trim();
          if (!desc) { rechazados.push({ prov, desc: '(vacía)', costo, estado: 'sin_match', motivo: 'descripcion vacia' }); continue; }
          if (costo == null) { rechazados.push({ prov, desc, costo, estado: 'sin_match', motivo: 'sin costo' }); continue; }
          rechazados.push({ prov, desc, costo, ef: e.producto?.ef, estado: e.estado, motivo: e.motivo || (e.estado === 'matched' ? `score=${(+e.score).toFixed(3)}` : '') });
          if (e.estado === 'matched') {
            const r = e.producto;
            const pack = detectarPackDrovencentro(desc);
            matches.push({ ef: r.ef, unidades: pack?.unidades ?? null, clavePack: pack?.texto ?? null, proveedor: prov, costo: Number(costo.toFixed(2)), productoIdCat: r.id, nombreRegistro: r.nombre_comercial, formaRegistro: r.forma });
          } else if (e.estado !== 'no_farmaco') {
            sinRegistro.push({ prov, desc, costo, motivo: e.motivo || 'sin_candidato' });
          }
        }
      }
    }
    console.log(`→ matched=${matches.length}, sinRegistro=${sinRegistro.length}, rescatadosA=${rescatadosA.length}, nuevosPropuestos=${rescatadosNuevos.length}`);

    // --- Rescate aprobado por el dueño (camino 'nuevoEnlace') ---
    // data/cobeca_rescate_aprobados.csv = data/cobeca_rescate_nuevos_<fecha>.csv con
    // las filas que el dueño decide aplicar (borra el resto). Cabecera:
    // descripcion,costo_usd,ef,pa_drovencentro,score
    const rutaAprobados = path.join(DIR_DATA, 'cobeca_rescate_aprobados.csv');
    let aprobadosAplicados = 0;
    let aprobadosOmitidos = 0;
    if (fs.existsSync(rutaAprobados)) {
      const lineas = fs.readFileSync(rutaAprobados, 'utf8').split(/\r?\n/).filter((l) => l.trim().length);
      lineas.shift(); // header
      for (const l of lineas) {
        const cols = parseCsvLine(l);
        if (!cols || cols.length < 5) { aprobadosOmitidos++; continue; }
        const desc = (cols[0] || '').trim();
        const costo = parseFloat(String(cols[1] || '').replace(',', '.'));
        const ef = (cols[2] || '').trim().toUpperCase();
        const reg = porEf.get(ef);
        if (!desc || !Number.isFinite(costo) || costo <= 0 || !reg) { aprobadosOmitidos++; continue; }
        const pack = detectarPackCobeca(desc);
        matches.push({ ef, unidades: pack?.unidades ?? null, clavePack: parsearDescripcion(desc).forma || null, proveedor: 'cobeca', costo: Number(costo.toFixed(2)), productoIdCat: reg.id, nombreRegistro: reg.nombre, formaRegistro: reg.forma, aprobado: true });
        aprobadosAplicados++;
      }
      console.log(`→ aprobados: ${aprobadosAplicados} aplicados, ${aprobadosOmitidos} omitidos (fila vacía o ef inválido)`);
    } else {
      console.log(`→ sin ${path.basename(rutaAprobados)}: solo se aplica el rescate a productos ya existentes`);
    }

    // --- Regla anti-colisión: si un ef tiene matches CON pack y sin pack (null),
    //     los null son referencias ambiguas a packs ya cubiertos -> se descartan
    //     (evita un SKU base espurio cuando ya hay presentaciones con pack).
    const efConPack = new Set();
    for (const m of matches) if (m.unidades != null) efConPack.add(m.ef);
    const matchesFiltrados = matches.filter((m) => !(m.unidades == null && efConPack.has(m.ef)));
    const descartadosNull = matches.length - matchesFiltrados.length;
    if (descartadosNull > 0) console.log(`→ ${descartadosNull} filas con pack ambiguo (null) descartadas por ef con packs`);

    // --- Agrupar por ef, asignar presentaciones/SKUs ---
    const porEfPacks = packsUnicosPorEf(matchesFiltrados);
    let nuevos = 0;
    const costoInsert = [];
    const catalogosConId = new Map(); // ef -> base catalogo.id

    const clientRows = [];
    const pulidoRows = []; // renombres aplicados (para reporte CSV del pulido)
    for (const [ef, packs] of porEfPacks) {
      const reg = porEf.get(ef);
      if (!reg) continue;
      const skus = asignarSkus(reg.sku, packs.map((p) => p.unidades));
      packs.forEach((p) => {
        const sku = skus.find((s) => (s.unidades == null ? p.unidades == null : s.unidades === p.unidades))?.sku || skus[skus.length - 1].sku;
        const mols = molesPorCatalogo.get(reg.id) || [];
        const moleculaTexto = mols.map((m) => m.nombre).sort((a, b) => a.localeCompare(b)).join(' - ') || null;
        // Nombre comercial pulido: "BASE X {n} {FORMA}" (INYECTABLE -> AMPOLLAS),
        // en vez de duplicar la forma con el texto del proveedor.
        const salida = armarNombrePresentacion(reg.nombre, reg.forma || null, p.unidades ?? null);
        const antes = p.unidades != null
          ? `${reg.nombre}${p.clavePack ? ' ' + textoPresentacion(p.unidades, p.clavePack) : ''}`
          : reg.nombre;
        if (p.unidades != null && salida.nombre !== antes) {
          pulidoRows.push({ ef, sku, antes, despues: salida.nombre, forma: reg.forma || '', frase: salida.frase || '', flag: salida.limpio ? 'limpio' : 'sin_coincidencia' });
        }
        clientRows.push({
          sku,
          nombre_comercial: salida.nombre,
          presentacion: salida.presentacion,
          unidades_por_presentacion: p.unidades ?? null,
          molecula: moleculaTexto,
          descripcion: reg.principio_activo || null,
          forma: reg.forma || null,
          linea: { ME: 'Linea Farmacia', HO: 'Linea Hospitalaria', MM: 'Material Medico', MI: 'Linea Farmacia' }[reg.categoria] || 'Linea Farmacia',
          laboratorio: reg.laboratorio,
          precio_usd: null,
          costo_usd: null,
          disponible: false,
          activo: true,
          visible_catalogo: true,
          requiere_cotizacion: false,
          es_cotizacion: false,
          fuente_inhrr_ef: ef,
        });
        catalogosConId.set(ef, reg.id);
        const min = Object.values(p.costoPorProveedor).reduce((a, b) => Math.min(a, b), Infinity);
        costoInsert.push({ ef, unidades: p.unidades ?? null, costo: min, porProveedor: p.costoPorProveedor });
        nuevos++;
      });
    }
    console.log(`→ ${porEfPacks.size} registros con presentaciones, ${nuevos} presentaciones a insertar`);

    // --- INSERT productos en lotes multi-VALUES (RETURNING id en mismo orden) ---
    const productoIdPorClave = new Map(); // `${ef}|${unidades}` -> id
    const COL_INSERT = `(sku, nombre_comercial, presentacion, unidades_por_presentacion, molecula,
        descripcion, forma, linea, laboratorio, precio_usd, costo_usd, disponible,
        activo, visible_catalogo, requiere_cotizacion, es_cotizacion, fuente_inhrr_ef)`;
    for (let i = 0; i < clientRows.length; i += CHUNK) {
      const lote = clientRows.slice(i, i + CHUNK);
      const placeholders = [];
      const params = [];
      let n = 1;
      for (const row of lote) {
        placeholders.push(`($${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},NULL,NULL,false,true,true,false,false,$${n++})`);
        params.push(row.sku, row.nombre_comercial, row.presentacion, row.unidades_por_presentacion,
          row.molecula, row.descripcion, row.forma, row.linea, row.laboratorio, row.fuente_inhrr_ef);
      }
      const { rows } = await client.query(
        `INSERT INTO public.productos ${COL_INSERT} VALUES ${placeholders.join(',')} RETURNING id`,
        params
      );
      lote.forEach((row, j) => {
        productoIdPorClave.set(`${row.fuente_inhrr_ef}|${row.unidades_por_presentacion ?? 'null'}`, rows[j].id);
      });
    }

    // --- producto_costos: upsert por (proveedor, producto_id), en lotes ---
    const costRows = [];
    for (const c of costoInsert) {
      const pid = productoIdPorClave.get(`${c.ef}|${c.unidades ?? 'null'}`);
      if (pid == null) continue;
      for (const [proveedor, costo] of Object.entries(c.porProveedor)) costRows.push([proveedor, pid, costo]);
    }
    for (let i = 0; i < costRows.length; i += CHUNK) {
      const lote = costRows.slice(i, i + CHUNK);
      const placeholders = [];
      const params = [];
      let n = 1;
      for (const [proveedor, pid, costo] of lote) {
        placeholders.push(`($${n++},$${n++},$${n++},now())`);
        params.push(proveedor, pid, costo);
      }
      await client.query(`
        INSERT INTO public.producto_costos (proveedor, producto_id, costo_usd, fecha)
        VALUES ${placeholders.join(',')}
        ON CONFLICT (proveedor, producto_id) DO UPDATE SET costo_usd = EXCLUDED.costo_usd, fecha = now()
      `, params);
    }

    // --- Recalcular costo/precio/disponible desde producto_costos (MIN global) ---
    const ids = [...new Set(costoInsert.map((c) => productoIdPorClave.get(`${c.ef}|${c.unidades ?? 'null'}`)).filter((x) => x != null))];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const lote = ids.slice(i, i + CHUNK);
      await client.query(`
        UPDATE public.productos p SET
          costo_usd = sub.minc,
          precio_usd = CASE WHEN sub.minc > 0 THEN round(sub.minc / $1::numeric, 2) ELSE NULL END,
          disponible = sub.minc > 0,
          updated_at = now()
        FROM (SELECT producto_id, MIN(costo_usd) AS minc FROM public.producto_costos
              WHERE producto_id = ANY($2::int[]) GROUP BY producto_id) sub
        WHERE sub.producto_id = p.id
      `, [MARGEN, lote]);
    }

    // --- Bridge producto_moleculas desde catalogo_moleculas (por ef) ---
    const puenteFinal = [];
    for (const [ef, packs] of porEfPacks) {
      const pcid = catalogosConId.get(ef);
      const mols = molesPorCatalogo.get(pcid) || [];
      for (const p of packs) {
        const pid = productoIdPorClave.get(`${ef}|${p.unidades ?? 'null'}`);
        if (pid == null) continue;
        for (const m of mols) puenteFinal.push({ producto_id: pid, molecula_id: m.mid });
      }
    }
    let puenteInsertados = 0;
    for (let i = 0; i < puenteFinal.length; i += CHUNK) {
      const lote = puenteFinal.slice(i, i + CHUNK);
      const placeholders = [];
      const params = [];
      let n = 1;
      for (const r of lote) {
        placeholders.push(`($${n++},$${n++})`);
        params.push(r.producto_id, r.molecula_id);
      }
      const res = await client.query(`
        INSERT INTO public.producto_moleculas (producto_id, molecula_id)
        VALUES ${placeholders.join(',')}
        ON CONFLICT (producto_id, molecula_id) DO NOTHING
        RETURNING id
      `, params);
      puenteInsertados += res.rows.length;
    }
    await client.query('COMMIT');
    console.log(`COMMIT ok — ${nuevos} productos; bridge ${puenteInsertados}; costos ${costoInsert.length}`);

    // --- Reportes CSV ---
    const fecha = new Date().toISOString().slice(0, 10);
    const csvCatalogo = ['proveedor,descripcion,costo,ef,estado,motivo']
      .concat(rechazados.map((r) => [r.prov, r.desc, r.costo ?? '', r.ef || '', r.estado, r.motivo].map(csvEscape).join(',')))
      .join('\n');
    const csvSinRegistro = ['proveedor,descripcion,costo,motivo']
      .concat(sinRegistro.map((r) => [r.prov, r.desc, r.costo ?? '', r.motivo].map(csvEscape).join(',')))
      .join('\n');
    fs.writeFileSync(path.join(DIR_DATA, `reconstruccion_catalogo_${fecha}.csv`), csvCatalogo);
    fs.writeFileSync(path.join(DIR_DATA, `reconstruccion_sin_registro_${fecha}.csv`), csvSinRegistro);
    console.log(`CSV: data/reconstruccion_catalogo_${fecha}.csv (${rechazados.length} filas)`);
    console.log(`CSV: data/reconstruccion_sin_registro_${fecha}.csv (${sinRegistro.length} sin registro)`);

    // --- Reportes del pulido de nombres ---
    // pulido_nombres: antes vs después de cada producto con presentación (el
    // dueño revisa los 'sin_coincidencia').
    const csvPulido = ['ef,sku,nombre_antes,nombre_despues,forma,frase_quitada,flag']
      .concat(pulidoRows.map((r) => [r.ef, r.sku, r.antes, r.despues, r.forma, r.frase, r.flag].map(csvEscape).join(',')))
      .join('\n');
    fs.writeFileSync(path.join(DIR_DATA, `pulido_nombres_${fecha}.csv`), csvPulido);
    // pulido_sin_pack: productos sin presentación (unidades NULL) — el dueño
    // los revisa para agregarles unidades/lotes después.
    const { rows: sinPack } = await client.query(`
      SELECT fuente_inhrr_ef AS ef, sku, nombre_comercial, forma, costo_usd, precio_usd
      FROM public.productos
      WHERE fuente_inhrr_ef IS NOT NULL AND unidades_por_presentacion IS NULL
      ORDER BY sku
    `);
    const csvSinPack = ['ef,sku,nombre_comercial,forma,costo_usd,precio_usd']
      .concat(sinPack.map((r) => [r.ef, r.sku, r.nombre_comercial, r.forma ?? '', r.costo_usd ?? '', r.precio_usd ?? ''].map(csvEscape).join(',')))
      .join('\n');
    fs.writeFileSync(path.join(DIR_DATA, `pulido_sin_pack_${fecha}.csv`), csvSinPack);
    console.log(`CSV: data/pulido_nombres_${fecha}.csv (${pulidoRows.length} renombres, ${pulidoRows.filter((r) => r.flag === 'sin_coincidencia').length} sin coincidencia)`);
    console.log(`CSV: data/pulido_sin_pack_${fecha}.csv (${sinPack.length} sin pack, para agregar unidades)`);
    console.log(`Resumen: matched=${matches.length} (${matchesFiltrados.length} tras anti-colisión), sinRegistro=${sinRegistro.length}, rescatadosA=${rescatadosA.length}, aprobados=${aprobadosAplicados}, productos=${nuevos}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();