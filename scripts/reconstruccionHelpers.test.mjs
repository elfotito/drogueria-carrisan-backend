// scripts/reconstruccionHelpers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectarPackCobeca,
  detectarPackDrovencentro,
  textoPresentacion,
  asignarSkus,
  packsUnicosPorEf,
  quitarForma,
  mostrarForma,
  armarNombrePresentacion,
} from './reconstruccionHelpers.mjs';

test('detectarPackCobeca: X30 al final', () => {
  assert.deepEqual(detectarPackCobeca('AC FOLICO TAB 5MG X10 BIOQ'), { unidades: 10 });
});

test('detectarPackCobeca: sin pack', () => {
  assert.equal(detectarPackCobeca('AC FOLICO TAB 5MG BIOQ'), null);
});

test('detectarPackDrovencentro: 10CAPS al final', () => {
  const r = detectarPackDrovencentro('ATOMOXETINA 10MG 10CAPS');
  assert.deepEqual({ unidades: r.unidades }, { unidades: 10 });
  assert.match(r.texto, /capsulas/);
});

test('detectarPackDrovencentro: sin pack', () => {
  assert.equal(detectarPackDrovencentro('ATOMOXETINA 10MG'), null);
});

test('textoPresentacion: tabletas', () => {
  assert.equal(textoPresentacion(30, 'TAB'), 'X 30 tabletas');
});

test('textoPresentacion: capsulas', () => {
  assert.equal(textoPresentacion(10, 'CAPS'), 'X 10 capsulas');
});

test('asignarSkus: un solo pack usa base', () => {
  assert.deepEqual(asignarSkus('ME41487', [10]), [{ sku: 'ME41487', unidades: 10 }]);
});

test('asignarSkus: dos packs genera /2 y /3', () => {
  assert.deepEqual(asignarSkus('ME41487', [30, 10]), [
    { sku: 'ME41487/2', unidades: 10 },
    { sku: 'ME41487/3', unidades: 30 },
  ]);
});

test('packsUnicosPorEf: dedupe por proveedor con MIN costo', () => {
  const matches = [
    { ef: 'E.F.45.256', unidades: 10, proveedor: 'cobeca', costo: 2.0 },
    { ef: 'E.F.45.256', unidades: 10, proveedor: 'cobeca', costo: 1.5 },
    { ef: 'E.F.45.256', unidades: 10, proveedor: 'drovencentro', costo: 3.0 },
    { ef: 'E.F.45.256', unidades: 30, proveedor: 'cobeca', costo: 4.0 },
  ];
  const m = packsUnicosPorEf(matches);
  const packs = m.get('E.F.45.256');
  assert.equal(packs.length, 2);
  assert.deepEqual(packs.find((p) => p.unidades === 10).costoPorProveedor, { cobeca: 1.5, drovencentro: 3.0 });
});

// --- quitarForma: despega la frase de forma del final del nombre INHRR ---

test('quitarForma: tablaetas recubiertas', () => {
  assert.deepEqual(quitarForma('AFLAMAX 50 mg TABLETAS RECUBIERTAS'), { base: 'AFLAMAX 50 mg', frase: 'TABLETAS RECUBIERTAS' });
});

test('quitarForma: comprimidos', () => {
  assert.deepEqual(quitarForma('ACIDO FOLICO 10 mg COMPRIMIDOS'), { base: 'ACIDO FOLICO 10 mg', frase: 'COMPRIMIDOS' });
});

test('quitarForma: solucion inyectable con concentracion por mL', () => {
  const r = quitarForma('ACIDO FOLICO 10 mg / mL SOLUCION INYECTABLE');
  assert.deepEqual(r, { base: 'ACIDO FOLICO 10 mg / mL', frase: 'SOLUCION INYECTABLE' });
});

test('quitarForma: rigidiza la suspension inyectable', () => {
  const r = quitarForma('BETADUO 6,430 mg - 2,631 mg / mL SUSPENSION INYECTABLE');
  assert.deepEqual(r, { base: 'BETADUO 6,430 mg - 2,631 mg / mL', frase: 'SUSPENSION INYECTABLE' });
});

test('quitarForma: sabor al final (colas largas)', () => {
  const r = quitarForma('CLORACE 500 mg – 4 mg GRANULOS PARA SOLUCIÓN ORAL SABOR A LIMÓN');
  assert.deepEqual(r, { base: 'CLORACE 500 mg – 4 mg', frase: 'GRANULOS PARA SOLUCIÓN ORAL SABOR A LIMÓN' });
});

test('quitarForma: polvo para solucion oral', () => {
  const r = quitarForma('TACHIGRIP FORTE POLVO PARA SOLUCION ORAL');
  assert.deepEqual(r, { base: 'TACHIGRIP FORTE', frase: 'POLVO PARA SOLUCION ORAL' });
});

test('quitarForma: nombre con parentesis (grageas)', () => {
  const r = quitarForma('FESTAL (PANCREATINA DE ORIGEN PORCINO) GRAGEAS');
  assert.deepEqual(r, { base: 'FESTAL (PANCREATINA DE ORIGEN PORCINO)', frase: 'GRAGEAS' });
});

test('quitarForma: guion dentro de la cola (tutti - frutti)', () => {
  const r = quitarForma('LARFACAINA 2 mg - 1,5 mg PASTILLAS SABOR A TUTTI - FRUTTI');
  assert.deepEqual(r, { base: 'LARFACAINA 2 mg - 1,5 mg', frase: 'PASTILLAS SABOR A TUTTI - FRUTTI' });
});

test('quitarForma: oftalmica con acentos', () => {
  const r = quitarForma('TIMOLOL - DORZOLAMIDA 0,5% - 2% SOLUCIÓN OFTALMICA');
  assert.deepEqual(r, { base: 'TIMOLOL - DORZOLAMIDA 0,5% - 2%', frase: 'SOLUCIÓN OFTALMICA' });
});

test('quitarForma: dosis con DOSIS delante (queda DOSIS)', () => {
  const r = quitarForma('FLUTIXAIR 125 mg - 25 mcg / DOSIS SUSPENSION INHALACION ORAL');
  assert.deepEqual(r, { base: 'FLUTIXAIR 125 mg - 25 mcg / DOSIS', frase: 'SUSPENSION INHALACION ORAL' });
});

test('quitarForma: cola truncada TABLETAS RE SI se limpia', () => {
  assert.deepEqual(quitarForma('ACETAMINOFEN - HIOSCINA N BUTIL BROMURO 500 mg-10mg TABLETAS RE'),
    { base: 'ACETAMINOFEN - HIOSCINA N BUTIL BROMURO 500 mg-10mg', frase: 'TABLETAS RE' });
});

test('quitarForma: COMP RECUBIERTOS (truncado comprimidos)', () => {
  assert.deepEqual(quitarForma('SITAGLIPTINA-METFORMINA CLORHIDRATO 50 mg-1000mg COMP RECUBIERTOS'),
    { base: 'SITAGLIPTINA-METFORMINA CLORHIDRATO 50 mg-1000mg', frase: 'COMP RECUBIERTOS' });
});

test('quitarForma: nombre sin forma no se toca', () => {
  assert.deepEqual(quitarForma('DICLOFENAC SODICO'), { base: 'DICLOFENAC SODICO', frase: null });
});

test('quitarForma: gotas solucion', () => {
  const r = quitarForma('ATROVERAN 10mg/mL SOLUCION GOTAS');
  assert.deepEqual(r, { base: 'ATROVERAN 10mg/mL', frase: 'SOLUCION GOTAS' });
});

test('quitarForma: jarabe', () => {
  assert.deepEqual(quitarForma('DESLORATADINA 2.5mg/5ml JARABE'), { base: 'DESLORATADINA 2.5mg/5ml', frase: 'JARABE' });
});

test('quitarForma: cubierta enterica / sabor', () => {
  assert.deepEqual(quitarForma('AZACARD 81 mg TABLETAS CON CUBIERTA ENTERICA'), { base: 'AZACARD 81 mg', frase: 'TABLETAS CON CUBIERTA ENTERICA' });
  assert.deepEqual(quitarForma('APLACAL 750 mg TABLETAS MASTICABLES SABOR A BANANA'), { base: 'APLACAL 750 mg', frase: 'TABLETAS MASTICABLES SABOR A BANANA' });
});

test('quitarForma: punto al final del token de forma', () => {
  assert.deepEqual(quitarForma('XAROX 10 mg TABLETAS RECUBIERTAS.'), { base: 'XAROX 10 mg', frase: 'TABLETAS RECUBIERTAS.' });
});

// --- mostrarForma: cuándo mostrar AMPOLLAS ---

test('mostrarForma: inyectable -> AMPOLLAS', () => {
  assert.equal(mostrarForma('SOLUCION INYECTABLE', 'INYECTABLE'), 'AMPOLLAS');
});

test('mostrarForma: liofilizado -> AMPOLLAS', () => {
  assert.equal(mostrarForma('POLVO LIOFILIZADO PARA SOLUCION INYECTABLE PARA INFUSION INTRAVENOSA', 'POLVO LIOFILIZADO'), 'AMPOLLAS');
});

test('mostrarForma: forma no inyectable conserva la frase', () => {
  assert.equal(mostrarForma('TABLETAS RECUBIERTAS', 'TABLETAS'), 'TABLETAS RECUBIERTAS');
});

test('mostrarForma: sin frase usa la forma column', () => {
  assert.equal(mostrarForma(null, 'SOLUCION ORAL'), 'SOLUCION ORAL');
});

// --- armarNombrePresentacion: build del nombre comercial ---

test('armarNombrePresentacion: limpia y arma X n FORMA', () => {
  const r = armarNombrePresentacion('AFLAMAX 50 mg TABLETAS RECUBIERTAS', 'TABLETAS', 10);
  assert.equal(r.nombre, 'AFLAMAX 50 mg X 10 TABLETAS RECUBIERTAS');
  assert.equal(r.presentacion, 'X 10 TABLETAS RECUBIERTAS');
  assert.equal(r.limpio, true);
});

test('armarNombrePresentacion: inyectable muestra AMPOLLAS', () => {
  const r = armarNombrePresentacion('KETOROLACO TROMETAMOL 30 mg / mL SOLUCION INYECTABLE', 'INYECTABLE', 10);
  assert.equal(r.nombre, 'KETOROLACO TROMETAMOL 30 mg / mL X 10 AMPOLLAS');
  assert.equal(r.presentacion, 'X 10 AMPOLLAS');
});

test('armarNombrePresentacion: sin coincidencia usa la forma como fallback', () => {
  const r = armarNombrePresentacion('CYNT 40 mg COMPRIMIDOS RECIBIERTOS', 'COMPRIMIDOS', 10);
  assert.equal(r.nombre, 'CYNT 40 mg COMPRIMIDOS RECIBIERTOS X 10 COMPRIMIDOS');
  assert.equal(r.presentacion, 'X 10 COMPRIMIDOS');
  assert.equal(r.limpio, false);
});

test('armarNombrePresentacion: sin pack no toca el nombre', () => {
  const r = armarNombrePresentacion('ACIDO FOLICO 10 mg COMPRIMIDOS', 'COMPRIMIDOS', null);
  assert.equal(r.nombre, 'ACIDO FOLICO 10 mg COMPRIMIDOS');
  assert.equal(r.presentacion, null);
});

test('armarNombrePresentacion: sin forma ni frase usa UNIDADES', () => {
  const r = armarNombrePresentacion('DICLOFENAC POT', null, 100);
  assert.equal(r.nombre, 'DICLOFENAC POT X 100 UNIDADES');
  assert.equal(r.presentacion, 'X 100 UNIDADES');
});