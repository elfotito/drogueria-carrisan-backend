// scripts/importar-catalogo.mjs
// Genera el catalogo limpio desde data/productos_inhrr.csv + productos_inhrr.json
// usando DuckDB. NO lee el CSV completo en memoria (regla big-data-sql).
//
// Salidas (en data/):
//   catalogo_productos_import.csv      -> fila por producto, con SKU {CAT}{num} (+ sufijo en colisiones)
//   catalogo_moleculas_import.csv      -> bridge ef -> molecula de moleculas_referencias (CIMA)
//   catalogo_moleculas_no_match.csv    -> moleculas INHRR sin match en CIMA (revision del dueno)
//   catalogo_duplicados_omitidos.csv   -> filas fusionadas (mismo nombre normalizado + mismo SKU)
//
// Uso: node scripts/importar-catalogo.mjs  (desde la raiz del backend)

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { DuckDBInstance } = require('@duckdb/node-api');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(ROOT, 'data', 'productos_inhrr.csv').replace(/\\/g, '/');
const JSON_PATH = path.join(ROOT, 'data', 'productos_inhrr.json').replace(/\\/g, '/');
const MOL_CSV = path.join(ROOT, 'data', 'moleculas_referencias_import.csv').replace(/\\/g, '/');
const OUT = {
  productos: path.join(ROOT, 'data', 'catalogo_productos_import.csv').replace(/\\/g, '/'),
  moleculas: path.join(ROOT, 'data', 'catalogo_moleculas_import.csv').replace(/\\/g, '/'),
  noMatch: path.join(ROOT, 'data', 'catalogo_moleculas_no_match.csv').replace(/\\/g, '/'),
  review: path.join(ROOT, 'data', 'catalogo_moleculas_revisar.csv').replace(/\\/g, '/'),
  duplicados: path.join(ROOT, 'data', 'catalogo_duplicados_omitidos.csv').replace(/\\/g, '/'),
};

const CUTOFF = '2026-09-05';
const SIM = (a, b) => `(1 - levenshtein(${a}, ${b})::DOUBLE / greatest(length(${a}), length(${b})))`;

const CAT_KW = [
  ['inyectable', 'HO', 0.6], ['inyeccion', 'HO', 0.6], ['ampolla', 'HO', 0.6], ['vial', 'HO', 0.6],
  ['parenteral', 'HO', 0.65], ['infusion', 'HO', 0.62], ['perfusion', 'HO', 0.65], ['jeringa', 'HO', 0.62],
  ['liofilizado', 'HO', 0.62], ['prellenada', 'HO', 0.6],
  ['gasas', 'MM', 0.85], ['algodon', 'MM', 0.85], ['guantes', 'MM', 0.85],
  ['comprimidos', 'ME', 0.62], ['comprimido', 'ME', 0.65], ['tabletas', 'ME', 0.62], ['tableta', 'ME', 0.65],
  ['capsulas', 'ME', 0.62], ['capsula', 'ME', 0.65], ['jarabe', 'ME', 0.62], ['suspension', 'ME', 0.6],
  ['gotas', 'ME', 0.6], ['gota', 'ME', 0.62], ['unguento', 'ME', 0.62], ['crema', 'ME', 0.62], ['pomada', 'ME', 0.65],
  ['grageas', 'ME', 0.62], ['gragea', 'ME', 0.65], ['ovulos', 'ME', 0.62], ['ovulo', 'ME', 0.65],
  ['supositorios', 'ME', 0.62], ['supositorio', 'ME', 0.65], ['gel', 'ME', 0.6], ['locion', 'ME', 0.6],
  ['oral', 'ME', 0.62], ['inhalacion', 'ME', 0.62], ['aerosol', 'ME', 0.65], ['granulado', 'ME', 0.62],
  ['anillo', 'ME', 0.65], ['otica', 'ME', 0.6], ['electrolitica', 'ME', 0.6], ['parche', 'ME', 0.6],
  ['pastilla', 'ME', 0.62], ['caramelo', 'ME', 0.62], ['champu', 'ME', 0.62], ['jabon', 'ME', 0.62],
  ['oftalmica', 'ME', 0.6], ['nasal', 'ME', 0.62], ['topica', 'ME', 0.62], ['enema', 'ME', 0.65],
  ['jalea', 'ME', 0.65], ['tintura', 'ME', 0.65],
];
const FORM_KW = [
  ['JERINGA PRELLENADA', 'jeringa', 0.62, 0],
  ['INYECTABLE', 'inyectable', 0.6, 1], ['INYECTABLE', 'inyeccion', 0.6, 1], ['INYECTABLE', 'parenteral', 0.65, 1],
  ['INYECTABLE', 'infusion', 0.62, 1], ['INYECTABLE', 'perfusion', 0.65, 1], ['INYECTABLE', 'ampolla', 0.6, 1],
  ['INYECTABLE', 'vial', 0.6, 1],
  ['POLVO LIOFILIZADO', 'liofilizado', 0.62, 2],
  ['POLVO PARA RECONSTITUCION', 'polvo', 0.6, 3],
  ['COMPRIMIDOS', 'comprimidos', 0.62, 10], ['COMPRIMIDOS', 'comprimido', 0.65, 10],
  ['TABLETAS', 'tabletas', 0.62, 10], ['TABLETAS', 'tableta', 0.65, 10],
  ['CAPSULAS', 'capsulas', 0.62, 10], ['CAPSULAS', 'capsula', 0.65, 10],
  ['JARABE', 'jarabe', 0.62, 10], ['SUSPENSION ORAL', 'suspension', 0.6, 10],
  ['GOTAS', 'gotas', 0.6, 10], ['GOTAS', 'gota', 0.62, 10],
  ['UNGUENTO', 'unguento', 0.62, 10], ['CREMA', 'crema', 0.62, 10], ['POMADA', 'pomada', 0.65, 10],
  ['GRAGEAS', 'grageas', 0.62, 10], ['GRAGEAS', 'gragea', 0.65, 10],
  ['OVULOS', 'ovulos', 0.62, 10], ['OVULOS', 'ovulo', 0.65, 10],
  ['SUPOSITORIOS', 'supositorios', 0.62, 10], ['SUPOSITORIOS', 'supositorio', 0.65, 10],
  ['GEL', 'gel', 0.6, 10], ['LOCION', 'locion', 0.6, 10], ['SOLUCION ORAL', 'oral', 0.62, 10],
  ['INHALACION', 'inhalacion', 0.62, 10], ['INHALACION', 'aerosol', 0.65, 10],
  ['GRANULADOS', 'granulado', 0.62, 10], ['ANILLO VAGINAL', 'anillo', 0.65, 10],
  ['SOLUCION OTICA', 'otica', 0.6, 10], ['PARCHE', 'parche', 0.6, 10], ['PASTILLA', 'pastilla', 0.62, 10],
  ['CARAMELO MEDICAMENTOSO', 'caramelo', 0.62, 10], ['CHAMPU', 'champu', 0.62, 10], ['JABON', 'jabon', 0.62, 10],
  ['SOLUCION OFTALMICA', 'oftalmica', 0.6, 10], ['SOLUCION NASAL', 'nasal', 0.62, 10],
  ['SOLUCION TOPICA', 'topica', 0.62, 10], ['ENEMA', 'enema', 0.65, 10], ['JALEA', 'jalea', 0.65, 10],
  ['TINTURA', 'tintura', 0.65, 10],
];
const STOPWORDS = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'o', 'e', 'en', 'para', 'por', 'con', 'un', 'una', 'al', 'di'];
const SALES = ['clorhidrato', 'diclorhidrato', 'hidrocloruro', 'bromhidrato', 'hidrobromuro', 'monohidrato', 'dihidrato',
  'trihidrato', 'hemihidrato', 'monohidratado', 'hidratado', 'hidratada', 'sulfato', 'bisulfato', 'besilato', 'citrato',
  'fumarato', 'maleato', 'tartrato', 'succinato', 'acetato', 'sodico', 'sodica', 'sodio', 'disodico', 'disodio',
  'potasico', 'potasica', 'potasio', 'calcico', 'calcica', 'calcio', 'fosfato', 'pamoato', 'nitrato', 'edetato',
  'estearato', 'carbonato', 'bicarbonato', 'gluconato', 'lactato', 'silicio', 'anhidro', 'anhidra', 'monobasico',
  'dibasico', 'micronizado', 'micronizada', 'acido', 'acida', 'ferroso', 'ferrosa', 'ferrico', 'ferrica'];
const STOP_SET = `('${STOPWORDS.join("', '")}')`;
const SALT_SET = `('${SALES.join("', '")}')`;

const catKwValues = CAT_KW.map(([k, c, u]) => `('${k}','${c}',${u})`).join(',\n        ');
const formKwValues = FORM_KW.map(([f, k, u, p]) => `('${f}','${k}',${u},${p})`).join(',\n        ');

const instance = await DuckDBInstance.create();
const connection = await instance.connect();

// =====================================================================
// 1) PRODUCTOS: purga + categoria + forma + SKU (dedupe/sufijos A/B)
// =====================================================================
const PRODUCTOS_SQL = `
  WITH j AS (SELECT ef AS jef, sortId FROM read_json_auto('${JSON_PATH}', format='array')),
  c AS (
    SELECT *,
      try_cast(NULLIF(fechaVigencia, '') AS DATE) AS vig
    FROM read_csv('${CSV}', header=true, all_varchar=true)
  ),
  base AS (
    SELECT c.ef,
      COALESCE(j.sortId, try_cast(regexp_replace(split_part(c.ef, '/', 1), '[^0-9]', '', 'g') AS BIGINT)) AS sort_id,
      c.nombre, c.principioActivo, c.representante, c.rifRepresentante,
      c.patrocinante, c.fabricante, c.fechaAprobado, c.fechaVigencia, c.fechaCancelado,
      c.vig
    FROM c LEFT JOIN j ON j.jef = c.ef
    WHERE c.vig IS NULL OR c.vig >= DATE '${CUTOFF}'
  ),
  norm AS (
    SELECT *,
      regexp_replace(regexp_replace(translate(lower(nombre), 'áéíóúüñÁÉÍÓÚÜ', 'aeiouunAEIOU'), '[^a-z0-9 ]', ' ', 'g'), '\\s+', ' ', 'g') AS n
    FROM base
  ),
  tok AS (
    SELECT ef, unnest(string_split(trim(n), ' ')) AS token FROM norm
    WHERE trim(n) <> ''
  ),
  cat_kw(kw, cat, umbral) AS (VALUES
        ${catKwValues}),
  cat_scores AS (
    SELECT t.ef, k.cat, k.kw, k.umbral, ${SIM('t.token', 'k.kw')} AS score
    FROM tok t CROSS JOIN cat_kw k
  ),
  cat_keep AS (
    SELECT ef, cat, score,
      row_number() OVER (PARTITION BY ef ORDER BY score DESC, cat DESC, kw) AS rn
    FROM cat_scores
    WHERE score >= umbral
  ),
  categorizado AS (
    SELECT n.*, COALESCE(k.cat, 'MI') AS categoria
    FROM norm n LEFT JOIN cat_keep k ON k.ef = n.ef AND k.rn = 1
  ),
  form_kw(forma, kw, umbral, prio) AS (VALUES
        ${formKwValues}),
  form_scores AS (
    SELECT t.ef, k.forma, k.prio, ${SIM('t.token', 'k.kw')} AS score
    FROM tok t CROSS JOIN form_kw k
  ),
  form_keep AS (
    SELECT ef, forma, score,
      row_number() OVER (PARTITION BY ef ORDER BY score DESC, prio ASC) AS rn
    FROM form_scores
    WHERE score >= 0.55
  ),
  formado AS (
    SELECT c.*,
      COALESCE(f.forma, CASE WHEN c.categoria = 'HO' THEN 'INYECTABLE' END) AS forma
    FROM categorizado c LEFT JOIN form_keep f ON f.ef = c.ef AND f.rn = 1
  ),
  -- dentro de un grupo (categoria, sort_id):
  --  * filas con el mismo nombre normalizado = duplicados del mismo producto
  --  * nombres distintos = colision real de SKU
  agrupado AS (
    SELECT *,
      row_number() OVER (PARTITION BY categoria, sort_id, n ORDER BY ef) AS rn_name,
      count(*) OVER (PARTITION BY categoria, sort_id) AS grp_n,
      count(distinct n) OVER (PARTITION BY categoria, sort_id) AS grp_distinct
    FROM formado
  ),
  -- se conserva 1 fila por nombre dentro del grupo
  conservado AS (
    SELECT *
    FROM agrupado
    WHERE rn_name = 1 OR grp_distinct = grp_n
  ),
  fin AS (
    SELECT *,
      row_number() OVER (PARTITION BY categoria, sort_id ORDER BY ef) AS rn_g,
      CASE
        WHEN grp_n = 1 THEN categoria || sort_id
        ELSE categoria || sort_id || chr(64 + CAST(row_number() OVER (PARTITION BY categoria, sort_id ORDER BY ef) AS INTEGER))
      END AS sku
    FROM agrupado
  )
  SELECT * FROM fin
`;

await connection.run(`CREATE OR REPLACE TEMP TABLE catalogo_agrupado AS ${PRODUCTOS_SQL}`);

await connection.run(`
  CREATE OR REPLACE TEMP TABLE catalogo_full AS
  WITH c AS (SELECT * FROM catalogo_agrupado WHERE rn_name = 1 OR grp_distinct = grp_n)
  SELECT *, row_number() OVER (PARTITION BY categoria, sort_id ORDER BY ef) AS rn,
    CASE
      WHEN row_number() OVER (PARTITION BY categoria, sort_id ORDER BY ef) = 1 THEN categoria || sort_id
      ELSE categoria || sort_id || chr(64 + CAST(row_number() OVER (PARTITION BY categoria, sort_id ORDER BY ef) AS INTEGER))
    END AS sku
  FROM c
`);

await connection.run(`
  CREATE OR REPLACE TEMP TABLE agrupado_drop AS
  SELECT ef, nombre FROM catalogo_agrupado WHERE NOT (rn_name = 1 OR grp_distinct = grp_n)
`);

const stats = await connection.runAndReadAll(`
  SELECT categoria, count(*) AS n FROM catalogo_full GROUP BY 1 ORDER BY n DESC
`);
console.log('=== PRODUCTOS EXPORTADOS por categoria ===');
console.table(stats.getRowObjects());

await connection.run(`COPY (
  SELECT ef, sort_id, sku, nombre, forma, categoria, principioActivo AS principio_activo,
         representante, rifRepresentante AS rif_representante, patrocinante, fabricante,
         NULLIF(fechaAprobado, '') AS fecha_aprobado,
         NULLIF(fechaVigencia, '') AS fecha_vigencia,
         NULLIF(fechaCancelado, '') AS fecha_cancelado
  FROM catalogo_full
  ORDER BY categoria, sort_id, ef
) TO '${OUT.productos}' (HEADER, DELIMITER ',')`);

const dupCount = (await connection.runAndReadAll(`
  SELECT count(*) AS n FROM agrupado_drop
`)).getRowObjects()[0];
console.log('duplicados omitidos:', dupCount.n.toString());

await connection.run(`COPY (
  SELECT ef, nombre FROM agrupado_drop ORDER BY ef
) TO '${OUT.duplicados}' (HEADER, DELIMITER ',')`);

const colisiones = (await connection.runAndReadAll(`
  SELECT categoria, sort_id, count(*) AS n,
    string_agg(ef || ' | ' || nombre, E'\\n' ORDER BY ef) AS detalle
  FROM catalogo_full
  GROUP BY 1, 2 HAVING count(*) > 1
  ORDER BY 3 DESC, 2
`)).getRowObjects();
console.log(`COLISIONES (mismo numero+categoria, SKU con sufijo): ${colisiones.length}`);
colisiones.forEach((r) => { console.log(`\n[${r.categoria}${r.sort_id}] (${r.n})`); console.log(r.detalle); });

// =====================================================================
// 2) MOLECULAS: split principioActivo + fuzzy token-a-token vs CIMA
// =====================================================================
await connection.run(`
  CREATE OR REPLACE TEMP TABLE mols_inhrr AS
  WITH c AS (
    SELECT *,
      try_cast(NULLIF(fechaVigencia, '') AS DATE) AS vig
    FROM read_csv('${CSV}', header=true, all_varchar=true)
  )
  SELECT trim(p) AS mol_inhrr, ef
  FROM (SELECT ef, unnest(string_split(principioActivo, ' - ')) AS p FROM c
        WHERE (vig IS NULL OR vig >= DATE '${CUTOFF}')
          AND principioActivo IS NOT NULL AND trim(principioActivo) <> '') x
  WHERE trim(p) <> ''
`);

const molStats = (await connection.runAndReadAll(`
  SELECT count(*) AS total_pares, count(distinct mol_inhrr) AS moleculas_distintas FROM mols_inhrr
`)).getRowObjects()[0];
console.log('moléculas:', molStats.total_pares.toString(), 'pares |', molStats.moleculas_distintas.toString(), 'distintas');

await connection.run(`
  CREATE OR REPLACE TEMP TABLE mol_scored AS
  WITH distinct_mol AS (
    SELECT mol_inhrr,
      list_filter(list_distinct(string_split(regexp_replace(regexp_replace(translate(lower(mol_inhrr), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9 ]', ' ', 'g'), '\\s+', ' ', 'g'), ' ')),
                  tok -> tok NOT IN ${STOP_SET} AND tok NOT IN ${SALT_SET}) AS toks
    FROM (SELECT DISTINCT mol_inhrr FROM mols_inhrr)
  ),
  refs AS (
    SELECT nombre AS ref_base,
      list_filter(list_distinct(string_split(regexp_replace(regexp_replace(translate(lower(trim(nombre)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9 ]', ' ', 'g'), '\\s+', ' ', 'g'), ' ')),
                  tok -> tok NOT IN ${STOP_SET} AND tok NOT IN ${SALT_SET}) AS rtoks
    FROM read_csv('${MOL_CSV}', header=true, all_varchar=true)
    WHERE nombre IS NOT NULL AND trim(nombre) <> ''
  ),
  pairs AS (
    SELECT m.mol_inhrr, array_length(m.toks) AS mlen,
           r.ref_base, array_length(r.rtoks) AS rlen,
           t1.tok AS mtok
    FROM distinct_mol m
    CROSS JOIN unnest(m.toks) AS t1(tok)
    CROSS JOIN refs r
  ),
  per_pairs AS (
    SELECT p.mol_inhrr, p.ref_base, p.mtok, ${SIM('p.mtok', 't2.tok')} AS score
    FROM pairs p
    JOIN refs refs2 ON refs2.ref_base = p.ref_base
    CROSS JOIN unnest(refs2.rtoks) AS t2(tok)
  ),
  best_per_mtok AS (
    SELECT mol_inhrr, ref_base, mtok, max(score) AS best
    FROM per_pairs
    GROUP BY 1, 2, 3
  ),
  per_ref AS (
    SELECT b.mol_inhrr, b.ref_base,
      (SELECT min(p.mlen) FROM pairs p WHERE p.mol_inhrr = b.mol_inhrr AND p.ref_base = b.ref_base) AS mlen,
      (SELECT min(p.rlen) FROM pairs p WHERE p.mol_inhrr = b.mol_inhrr AND p.ref_base = b.ref_base) AS rlen,
      sum(b.best) AS sumbest
    FROM best_per_mtok b
    GROUP BY 1, 2
  ),
  scored AS (
    SELECT mol_inhrr, ref_base,
      sumbest / greatest(mlen, rlen) AS score
    FROM per_ref
  )
  SELECT * FROM scored
`);

await connection.run(`
  CREATE OR REPLACE TEMP TABLE mol_resolved AS
  SELECT mol_inhrr, ref_base AS mol_cima, round(score, 3) AS score
  FROM (
    SELECT mol_inhrr, ref_base, score,
      row_number() OVER (PARTITION BY mol_inhrr ORDER BY score DESC, ref_base) AS rn
    FROM mol_scored
    WHERE score >= 0.85
  ) x WHERE rn = 1
`);

await connection.run(`
  CREATE OR REPLACE TEMP TABLE mol_review AS
  SELECT mol_inhrr, ref_base AS mol_cima, round(score, 3) AS score
  FROM (
    SELECT mol_inhrr, ref_base, score,
      row_number() OVER (PARTITION BY mol_inhrr ORDER BY score DESC, ref_base) AS rn
    FROM mol_scored
    WHERE score >= 0.75 AND score < 0.85
  ) x WHERE rn = 1
`);

const matchStats = (await connection.runAndReadAll(`
  SELECT
    (SELECT count(distinct mol_inhrr) FROM mol_resolved) AS con_match,
    (SELECT count(distinct mol_inhrr) FROM mols_inhrr
       WHERE mol_inhrr NOT IN (SELECT mol_inhrr FROM mol_resolved)) AS sin_match
`)).getRowObjects()[0];
console.log('match: con =', matchStats.con_match.toString(), '| sin =', matchStats.sin_match.toString());

await connection.run(`
  COPY (
    SELECT m.ef, m.mol_inhrr, r.mol_cima, r.score
    FROM mols_inhrr m
    JOIN mol_resolved r ON r.mol_inhrr = m.mol_inhrr
    ORDER BY m.ef, r.score DESC
  ) TO '${OUT.moleculas}' (HEADER, DELIMITER ',')
`);

await connection.run(`
  COPY (
    SELECT m.mol_inhrr, count(distinct m.ef) AS veces
    FROM mols_inhrr m
    LEFT JOIN mol_resolved r ON r.mol_inhrr = m.mol_inhrr
    LEFT JOIN mol_review v ON v.mol_inhrr = m.mol_inhrr
    WHERE r.mol_inhrr IS NULL AND v.mol_inhrr IS NULL
    GROUP BY 1 ORDER BY 2 DESC, 1
  ) TO '${OUT.noMatch}' (HEADER, DELIMITER ',')
`);

await connection.run(`
  COPY (
    SELECT m.mol_inhrr, v.mol_cima, v.score, count(distinct m.ef) AS veces
    FROM mol_review v
    JOIN mols_inhrr m ON m.mol_inhrr = v.mol_inhrr
    GROUP BY 1, 2, 3 ORDER BY 4 DESC, 1
  ) TO '${OUT.review}' (HEADER, DELIMITER ',')
`);

await instance.destroy?.();
console.log('\nOK. Archivos exportados en data/');