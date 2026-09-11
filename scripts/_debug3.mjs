import 'dotenv/config';
import pg from 'pg';
import { parsearDescripcion, matchScore, construirIndice, candidatosPara } from './lib/cobecaParser.mjs';

const DB_CONFIG = {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

const TARGETS = [
  ['TACHIPIRIN GTS PED 30ML ELM', [39378]],
  ['TACHIPIRIN FORTE JBE PED 120ML ELM', [39381]],
  ['TERAGRIP SUPRA TAB REC 650MG X10 FAR', [39391]],
  ['TERAGRIP FORTE TAB REC 650/4 NOCHX4 FAR', [39389]],
];

const client = new pg.Client(DB_CONFIG);
await client.connect();
const { rows: productos } = await client.query(
  `SELECT id, nombre_comercial, molecula, forma, laboratorio FROM public.productos WHERE activo = true ORDER BY id`
);
await client.end();

const idx = construirIndice(productos);

for (const [desc, targetIds] of TARGETS) {
  const parsed = parsearDescripcion(desc);
  parsed._raw = desc;
  console.log(`\n>>> ${desc}`);
  console.log(`    forma=${parsed.forma} mol=[${parsed.molTokens.join(',')}] conc=${parsed.conc} lab=${parsed.labToken}`);
  for (const id of targetIds) {
    const p = productos.find(x => x.id === id);
    if (!p) { console.log(`    ** producto ${id} no existe`); continue; }
    const d = matchScore(parsed, p, true);
    const fin = d.fin ?? d.final;
    const motivo = d.rejectCombo ? ` [REJECT combo]` : d.rejectDosis ? ` [REJECT dosis]` : '';
    console.log(`    --> ${id} ${p.nombre_comercial.substring(0, 55)}`);
    console.log(`        final=${fin?.toFixed? fin.toFixed(3): fin}${motivo} nom=${d.nomScore?.toFixed(3)} score=${d.score?.toFixed? d.score.toFixed(3):d.score} parts=${d.parts}`);
  }
}