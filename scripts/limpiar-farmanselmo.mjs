import fs from 'fs';

const ORIGEN = 'src/migrations/farmanselmo_catalogo.csv';
const LIMPIO = 'data/farmanselmo_limpio.csv';
const EXTRA = 'data/farmanselmo_extra.csv';

const DESCARTADAS = ['bebe-1', 'belleza', 'hogar', 'alimentos'];

function parsearCSV(txt) {
  const filas = [];
  let fila = [];
  let campo = '';
  let enCitado = false;
  const pushCampo = () => { fila.push(campo); campo = ''; };
  const pushFila = () => { if (fila.length) filas.push(fila); fila = []; };
  let i = 0;
  while (i < txt.length) {
    const c = txt[i];
    if (enCitado) {
      if (c === '"') {
        if (txt[i + 1] === '"') { campo += '"'; i += 2; continue; }
        enCitado = false; i++;
      } else { campo += c; i++; }
    } else if (c === '"') {
      enCitado = true; i++;
    } else if (c === ',') { pushCampo(); i++; }
    else if (c === '\r') { i++; }
    else if (c === '\n') { pushCampo(); pushFila(); i++; }
    else { campo += c; i++; }
  }
  pushCampo();
  pushFila();
  return filas;
}

function escaparCSV(v) {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const txt = fs.readFileSync(ORIGEN, 'utf-8');
const filas = parsearCSV(txt);
if (!filas.length) throw new Error('CSV vacio');

const header = filas[0];
const datos = filas.slice(1);
const idxSlug = header.indexOf('categoria_slug');
if (idxSlug === -1) throw new Error(`No existe columna categoria_slug. Header: ${header.join('|')}`);

const limpio = [header];
const extra = [header];
let contador = { limpio: 0, extra: 0 };

for (const f of datos) {
  const slug = (f[idxSlug] || '').trim();
  const departamento = slug.split('/')[0];
  if (DESCARTADAS.includes(departamento)) {
    extra.push(f);
    contador.extra++;
  } else {
    limpio.push(f);
    contador.limpio++;
  }
}

const aTexto = (rows) => rows.map((r) => r.map(escaparCSV).join(',')).join('\n') + '\n';
fs.writeFileSync(LIMPIO, aTexto(limpio), 'utf-8');
fs.writeFileSync(EXTRA, aTexto(extra), 'utf-8');

console.log(`Header columnas: ${header.length}`);
console.log(`Total filas datos: ${datos.length}`);
console.log(`LIMPIOS (para cruce): ${contador.limpio}  -> ${LIMPIO}`);
console.log(`EXTRA (descartados) : ${contador.extra}  -> ${EXTRA}`);
console.log('Descartados por departamento: ' + DESCARTADAS.join(', '));