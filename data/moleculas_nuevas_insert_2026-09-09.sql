INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'y sacubitrilo', NULL, ARRAY["Sacubitrilo valsartan sodico hidratado","Sacubitrilo valsartan"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Valsartan'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'y sacubitrilo');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Sultamicilina', NULL, ARRAY["Sultamicilina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Sultamicilina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Sultamicilina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Clenbuterol', NULL, ARRAY["Clenbuterol"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Clenbuterol'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Clenbuterol');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Sucralfato', NULL, ARRAY["Sucralfato"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Sucralfato'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Sucralfato');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Ciprofibrato', NULL, ARRAY["Ciprofibrato"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Ciprofibrato'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Ciprofibrato');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Cefoperazona', NULL, ARRAY["Cefoperazona"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Cefoperazona'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Cefoperazona');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Fenoterol', NULL, ARRAY["Fenoterol bromhidrato"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Fenoterol'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Fenoterol');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Cefradina', NULL, ARRAY["Cefradina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Cefradina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Cefradina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Dihidroergotamina', NULL, ARRAY["Dihidroergotamina","Mesilato de dihidroergotamina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Dihidroergotamina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Dihidroergotamina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Furazolidona', NULL, ARRAY["Furazolidona"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Furazolidona'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Furazolidona');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Molgramostim', NULL, ARRAY["Molgramostim"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Molgramostim'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Molgramostim');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Policresuleno', NULL, ARRAY["Policresuleno"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Policresuleno'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Policresuleno');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Timoestimulina', NULL, ARRAY["Timoestimulina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Timoestimulina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Timoestimulina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Trifluoperazina', NULL, ARRAY["Trifluoperazina","Trifluoperazina clorhidrato"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Trifluoperazina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Trifluoperazina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Buspirona', NULL, ARRAY["Buspirona"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Buspirona'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Buspirona');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Carisoprodol', NULL, ARRAY["Carisoprodol"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Carisoprodol'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Carisoprodol');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Etamsilato', NULL, ARRAY["Etamsilato"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Etamsilato'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Etamsilato');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Nitrazepam', NULL, ARRAY["Nitrazepam"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Nitrazepam'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Nitrazepam');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Tribenosido', NULL, ARRAY["Tribenosido"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Tribenosido'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Tribenosido');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Acemetacina', NULL, ARRAY["Acemetacina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Acemetacina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Acemetacina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'borico', NULL, ARRAY["Acido borico"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Acido'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'borico');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Didanosina', NULL, ARRAY["Didanosina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Didanosina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Didanosina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Doripenem', NULL, ARRAY["Doripenem"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Doripenem'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Doripenem');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Ergometrina', NULL, ARRAY["Ergometrina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Ergometrina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Ergometrina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Fenindiona', NULL, ARRAY["Fenindiona"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Fenindiona'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Fenindiona');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Fosfestrol', NULL, ARRAY["Fosfestrol"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Fosfestrol'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Fosfestrol');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Halotano', NULL, ARRAY["Halotano"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Halotano'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Halotano');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Hidrotalcita', NULL, ARRAY["Hidrotalcita"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Hidrotalcita'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Hidrotalcita');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Lepirudina', NULL, ARRAY["Lepirudina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Lepirudina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Lepirudina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Loteprednol', NULL, ARRAY["Loteprednol"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Loteprednol'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Loteprednol');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Nelfinavir', NULL, ARRAY["Nelfinavir"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Nelfinavir'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Nelfinavir');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Pranlukast', NULL, ARRAY["Pranlukast"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Pranlukast'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Pranlukast');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Rofecoxib', NULL, ARRAY["Rofecoxib"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Rofecoxib'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Rofecoxib');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Rosiglitazona', NULL, ARRAY["Rosiglitazona"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Rosiglitazona'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Rosiglitazona');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Succinilsulfatiazol', NULL, ARRAY["Succinilsulfatiazol"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Succinilsulfatiazol'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Succinilsulfatiazol');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Desonida', NULL, ARRAY["Desonida"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Desonida'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Desonida');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Oxacilina', NULL, ARRAY["Oxacilina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Oxacilina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Oxacilina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Oxolamina', NULL, ARRAY["Oxolamina citrato"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Oxolamina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Oxolamina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Sibutramina', NULL, ARRAY["Sibutramina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Sibutramina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Sibutramina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Cefalotina', NULL, ARRAY["Cefalotina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Cefalotina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Cefalotina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Dicloxacilina', NULL, ARRAY["Dicloxacilina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Dicloxacilina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Dicloxacilina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Isoconazol', NULL, ARRAY["Isoconazol"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Isoconazol'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Isoconazol');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Kanamicina', NULL, ARRAY["Kanamicina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Kanamicina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Kanamicina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Aminofilina', NULL, ARRAY["Aminofilina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Aminofilina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Aminofilina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Cimetidina', NULL, ARRAY["Cimetidina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Cimetidina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Cimetidina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Betacaroteno', NULL, ARRAY["Betacaroteno"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Betacaroteno'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Betacaroteno');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Carbacol', NULL, ARRAY["Carbacol"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Carbacol'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Carbacol');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Dactinomicina', NULL, ARRAY["Dactinomicina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Dactinomicina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Dactinomicina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Feniramina', NULL, ARRAY["Feniramina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Feniramina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Feniramina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Hexamidina', NULL, ARRAY["Hexamidina"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Hexamidina'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Hexamidina');

INSERT INTO moleculas_referencias (nombre, nombre_generico_en, sinonimos, atc_id)
SELECT 'Sulfacetamida', NULL, ARRAY["Sulfacetamida"]::text[], a.id
FROM atc_clasificaciones a
WHERE a.codigo = 'Sulfacetamida'
  AND NOT EXISTS (SELECT 1 FROM moleculas_referencias m WHERE m.nombre = 'Sulfacetamida');
