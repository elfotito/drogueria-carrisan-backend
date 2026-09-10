import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { config } from 'dotenv';
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

let all = [];
let offset = 0;
while (true) {
  const { data } = await supabase.from('productos')
    .select('id, sku, nombre_comercial, molecula, forma, laboratorio, fuente_inhrr_ef')
    .eq('activo', true)
    .is('foto_url', null)
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  all = all.concat(data);
  offset += 1000;
  if (data.length < 1000) break;
}

console.log('Total sin foto:', all.length);

const esc = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const header = 'id,sku,nombre_comercial,molecula,forma,laboratorio,fuente_inhrr_ef';
const lines = [header];
for (const p of all) {
  lines.push([p.id, p.sku, p.nombre_comercial, p.molecula, p.forma, p.laboratorio, p.fuente_inhrr_ef].map(esc).join(','));
}
fs.writeFileSync('data/productos_sin_foto.csv', lines.join('\n'), 'utf-8');
console.log('Guardado: data/productos_sin_foto.csv');
