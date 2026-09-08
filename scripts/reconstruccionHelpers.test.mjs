// scripts/reconstruccionHelpers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectarPackCobeca,
  detectarPackDrovencentro,
  textoPresentacion,
  asignarSkus,
  packsUnicosPorEf,
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