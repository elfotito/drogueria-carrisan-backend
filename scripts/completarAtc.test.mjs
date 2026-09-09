import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSinSales, clasificar, csvField } from './completarAtc.mjs';
import { PIPELINE } from './moleculaDuplicados.mjs';

const { normName, levenshtein } = PIPELINE;
const deps = { normTokenFn: normName, levenshteinFn: levenshtein };

const nivel5 = [
  { codigo: 'G04BX03', nombre: 'Acido acetohidroxamico' },
  { codigo: 'M05BA01', nombre: 'Acido etidronico' },
  { codigo: 'M05BA06', nombre: 'Acido ibandronico' },
  { codigo: 'B05AA07', nombre: 'Hidroxietil almidon' },
  { codigo: 'B03AB04', nombre: 'Ferrico hidroxido' },
  { codigo: 'S02DA93', nombre: 'Laurilsulfato sodico' },
  { codigo: 'A02AH91', nombre: 'Sodio bicarbonato' },
  { codigo: 'G01AD02', nombre: 'Acido acetico' },
  { codigo: 'S02AA10', nombre: 'Acido acetico' },
  { codigo: 'V08CA08', nombre: 'Acido gadobenico' },
  { codigo: 'V08CA02', nombre: 'Acido gadoterico' },
];

test('scoreSinSales no filtra sales (no falsea Sodio Hidroxido == Ferrico Hidroxido)', () => {
  const a = 'Sodio Hidroxido';
  const b = 'Ferrico hidroxido';
  assert.ok(scoreSinSales(normName, levenshtein, a, b) < 0.9);
});

test('scoreSinSales detecta match exacto por orden invertido', () => {
  assert.equal(scoreSinSales(normName, levenshtein, 'Acetohidroxamico Acido', 'Acido acetohidroxamico'), 1);
});

test('clasificar auto cuando el mejor es unico >= 0.90', () => {
  const r = clasificar({ nombre: 'Acetohidroxamico Acido' }, nivel5, deps);
  assert.equal(r.estado, 'auto');
  assert.equal(r.candidato.codigo, 'G04BX03');
});

test('clasificar auto ignora acentos/orden (Alendronico Acido)', () => {
  const r = clasificar({ nombre: 'Ibandronico Acido' }, nivel5, deps);
  assert.equal(r.estado, 'auto');
  assert.equal(r.candidato.codigo, 'M05BA06');
});

test('clasificar revisar con candidato ambiguo (varias vias del mismo acido)', () => {
  const r = clasificar({ nombre: 'Acetico Acido' }, nivel5, deps);
  assert.equal(r.estado, 'revisar');
  assert.ok(r.candidatos.length >= 2);
});

test('clasificar revisar con acronimos de familia (gadolinio)', () => {
  const r = clasificar({ nombre: 'Gadobenico Acido' }, nivel5, deps);
  assert.equal(r.estado, 'revisar');
  assert.equal(r.candidato.codigo, 'V08CA08');
});

test('clasificar sin_candidato cuando no hay match >= 0.75', () => {
  const r = clasificar({ nombre: 'Alfa Amilcinamaldehido' }, nivel5, deps);
  assert.equal(r.estado, 'sin_candidato');
});

test('csvField escapa comas y comillas', () => {
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('c "d"'), '"c ""d"""');
  assert.equal(csvField('hola'), 'hola');
});