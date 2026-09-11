import fs from 'fs';
const lines = fs.readFileSync('data/fotos_cobeca_carga.csv', 'utf8').split('\n').slice(1).filter(Boolean);
for (const l of lines) {
  if (/TERAGRIP|TACHIPIRIN|TACHIGRIP/i.test(l)) {
    console.log(l);
  }
}