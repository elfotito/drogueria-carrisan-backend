// scripts/moleculaDuplicados.test.mjs
// node --test scripts/moleculaDuplicados.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normName, tokensSignificativos, canonico, levenshtein, scoreMoleculas,
  bigramas, detectarDuplicados,
} from './moleculaDuplicados.mjs';

describe('normName', () => {
  it('normaliza acentos y quita puntuación', () => {
    assert.equal(normName('Ácido Acetilsalicílico'), 'acido acetilsalicilico');
  });
  it('achica a minúsculas', () => {
    assert.equal(normName('Amlodipino'), 'amlodipino');
  });
});

describe('tokensSignificativos / canonico', () => {
  it('quita sales y stopwords', () => {
    assert.deepEqual(tokensSignificativos('Abacavir Clorhidrato'), ['abacavir']);
    assert.equal(canonico('Abacavir Clorhidrato'), 'abacavir');
    assert.equal(canonico('Abacavir Sulfato'), 'abacavir');
  });
  it('canónico ordena los tokens (invariante de orden)', () => {
    assert.equal(canonico('Acido Fólico'), canonico('Fólico Acido'));
  });
  it('no mete basura por acentos raros', () => {
    assert.equal(canonico('Lenvatinib Besilato'), 'lenvatinib');
  });
});

describe('levenshtein', () => {
  it('casos base', () => {
    assert.equal(levenshtein('', ''), 0);
    assert.equal(levenshtein('ab', ''), 2);
    assert.equal(levenshtein('kitten', 'sitting'), 3);
  });
  it('simétrico', () => {
    assert.equal(levenshtein('yodo', 'iodo'), 1);
    assert.equal(levenshtein('iodo', 'yodo'), 1);
  });
});

describe('scoreMoleculas', () => {
  it('idénticas -> 1', () => {
    assert.equal(scoreMoleculas('Paracetamol', 'Paracetamol'), 1);
  });
  it('variante con sal -> 1', () => {
    assert.equal(scoreMoleculas('Paracetamol', 'Paracetamol Clorhidrato'), 1);
  });
  it('masculino/femenino CIMA -> alto', () => {
    const s = scoreMoleculas('Amlodipino', 'Amlodipina');
    assert.ok(s >= 0.9, `score ${s}`);
  });
  it('penicilina V vs G -> bajo (distintos)', () => {
    const s = scoreMoleculas('Penicilina V', 'Penicilina G');
    assert.ok(s < 0.75, `score ${s}`);
  });
  it('drogas distintas -> bajo', () => {
    const s = scoreMoleculas('Lisinopril', 'Losartán');
    assert.ok(s < 0.5, `score ${s}`);
  });
});

describe('bigramas', () => {
  it('genera bigramas únicos', () => {
    assert.deepEqual(bigramas('yodo'), ['yo', 'od', 'do']);
    assert.deepEqual(bigramas('iodo'), ['io', 'od', 'do']);
  });
});

describe('detectarDuplicados', () => {
  const mols = [
    { id: 1, nombre: 'Abacavir', nombre_generico_en: 'Abacavir', atc_codigo: 'J05AF02' },
    { id: 2, nombre: 'Abacavir Clorhidrato', nombre_generico_en: 'Abacavir', atc_codigo: 'J05AF02' },
    { id: 3, nombre: 'Abacavir Sulfato', nombre_generico_en: 'Abacavir', atc_codigo: 'J05AF02' },
    { id: 4, nombre: 'Penicilina V', nombre_generico_en: 'Phenoxymethylpenicillin', atc_codigo: 'J01CE02' },
    { id: 5, nombre: 'Penicilina G', nombre_generico_en: 'Penicillin G', atc_codigo: 'J01CE01' },
    { id: 6, nombre: 'Yodo', nombre_generico_en: 'Iodine', atc_codigo: 'D08AG03' },
    { id: 7, nombre: 'Iodo', nombre_generico_en: 'Iodine', atc_codigo: 'D08AG03' },
    { id: 8, nombre: 'Vitamina A', nombre_generico_en: 'Vitamin A', atc_codigo: 'A11CA01' },
    { id: 9, nombre: 'Vitamina C', nombre_generico_en: 'Vitamin C', atc_codigo: 'A11GA01' },
    { id: 10, nombre: 'Rasagilina Besilato', nombre_generico_en: 'Rasagiline', atc_codigo: 'N04BD02' },
    { id: 11, nombre: 'Rasagilina Mesilato', nombre_generico_en: 'Rasagiline', atc_codigo: 'N04BD02' },
    { id: 12, nombre: 'Amlodipino', nombre_generico_en: '', atc_codigo: 'C08CA01' },
    { id: 13, nombre: 'Amlodipina', nombre_generico_en: '', atc_codigo: 'C08CA01' },
  ];

  it('detecta canónico igual mismo EN mismo ATC (sal)', () => {
    const res = detectarDuplicados(mols, { umbralAtc: 0.75, umbralSimilar: 0.9 });
    const par = res.find((r) => r.idA === '1' && r.idB === '2');
    assert.ok(par, 'Abacavir/Abacavir Clorhidrato debe detectarse');
    assert.equal(par.motivo, 'canonico_igual');
  });

  it('detecta besilato/mesilato con mismo ATC', () => {
    const res = detectarDuplicados(mols);
    const par = res.find((r) => r.idA === '10' && r.idB === '11');
    assert.ok(par, 'Rasagilina Besilato/Mesilato debe detectarse');
  });

  it('NO fusiona Penicilina V vs G (ATC distinto)', () => {
    const res = detectarDuplicados(mols);
    const par = res.find((r) => (r.idA === '4' && r.idB === '5') || (r.idA === '5' && r.idB === '4'));
    assert.equal(par, undefined, 'Penicilina V/G no son duplicados');
  });

  it('NO fusiona Vitamina A vs Vitamina C', () => {
    const res = detectarDuplicados(mols);
    const par = res.find((r) => (r.idA === '8' && r.idB === '9') || (r.idA === '9' && r.idB === '8'));
    assert.equal(par, undefined, 'Vitaminas A/C son distintas');
  });

  it('detecta Iodo/Yodo', () => {
    const res = detectarDuplicados(mols);
    const par = res.find((r) => (r.idA === '6' && r.idB === '7') || (r.idA === '7' && r.idB === '6'));
    assert.ok(par, 'Iodo/Yodo deben detectarse');
    assert.ok(['mismo_generico_en', 'nombre_similar'].includes(par.motivo), `motivo inesperado: ${par.motivo}`);
  });

  it('detecta Amlodipino/Amlodipina (género, un token)', () => {
    const res = detectarDuplicados(mols);
    const par = res.find((r) => (r.idA === '12' && r.idB === '13') || (r.idA === '13' && r.idB === '12'));
    assert.ok(par, 'Amlodipino/Amlodipina se detecta');
  });
});