import { parsearDescripcion, esComboCobeca, esComboProducto } from './lib/cobecaParser.mjs';

const probes = [
  ['combo-unitless', 'TERAGRIP FORTE TAB REC 650/4 NOCHX4 FAR', true],
  ['combo-hct-std', 'ANTAAR/HCT TAB 5MG/6,25MG X30', true],
  ['combo-no-segunda-unit', 'BIOTALOL 10/6,25 MG', true],
  ['no-combo-vol', 'AMIKACINA AMP 500MG/2ML X1', false],
  ['no-combo-vol-sp', 'AMOXICILINA SUSP 250MG/5ML', false],
  ['combo-triple', 'TACHIGRIP FORTE SOB 650/2/30MG X6', true],
  ['combo-num-sep', 'TERAGRIP FORTE GRANU 650/2MG DIA X6', true],
  ['combo-req-both', 'BISOPROLOL HCT 5MG/6,25MG X30', true],
];
for (const [label, d, esperado] of probes) {
  const p = parsearDescripcion(d);
  const comboC = esComboCobeca(p, d);
  const ok = comboC === esperado ? 'OK' : `FALLO (esperado ${esperado})`;
  console.log(`${ok} [${label}] combo=${comboC} objeto=${JSON.stringify(p.combo)} conc=${p.conc}${p.conc2 ? '|' + p.conc2 : ''}`);
}

const prodCombo = {
  nombre_comercial: 'BISOPROLOL FUMARATO 10 mg X 30 COMPRIMIDOS RECUBIERTOS',
  molecula: 'BISOPROLOL FUMARATO',
};
console.log('prodCombo mono bisoprolol 10mg:', esComboProducto(prodCombo), '(esperado false)');
const prodNoche = {
  nombre_comercial: 'TERAGRIPFORTE NOCHE 650mg-4mg X 4 GRANULADO',
  molecula: 'ACETAMINOFEN - DIFENHIDRAMINA',
};
console.log('prodCombo noche x4:', esComboProducto(prodNoche), '(esperado true)');