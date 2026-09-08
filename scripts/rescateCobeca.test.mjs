import test from 'node:test';
import assert from 'node:assert/strict';
import {
  marcaDeDesc,
  extraerDosis,
  construirIndiceMolecula,
  candidatoNuevoEnlace,
  emparejarConDroven,
  rescatarCobeca,
  dosisCoincideConProducto,
} from './rescateCobeca.mjs';

test('marcaDeDesc: primera palabra alfabetica >= 3', () => {
  assert.equal(marcaDeDesc('ABRETIA CAP 10MG X10 MEG'), 'abretia');
  assert.equal(marcaDeDesc('ACEITE D/COCO RECETT 30ML'), 'aceite');
  assert.equal(marcaDeDesc('AC FOLICO TAB 5MG X10 BIOQ'), 'folico');
  assert.equal(marcaDeDesc(null), null);
  assert.equal(marcaDeDesc('X10 X20'), null);
});

test('extraerDosis: primer numero con unidad', () => {
  assert.equal(extraerDosis('ABRETIA CAP 18MG X10 MEG'), 18);
  assert.equal(extraerDosis('ACICLOVIR TAB 12,5MG X30'), 12.5);
  assert.equal(extraerDosis('ATOMOXETINA 10MG 10CAPS'), 10);
  assert.equal(extraerDosis('ACEITE D/COCO 30ML'), 30);
  assert.equal(extraerDosis('GEL SIN DOSIS'), null);
});

test('candidatoNuevoEnlace: elige la molecula correcta y respeta el umbral combinado', () => {
  const dbShape = [
    { id: 1, molecula: 'ACICLOVIR', nombre_comercial: 'ZOVIRAX TABLETA 1000MG' },
    { id: 2, molecula: 'ACETAMINOFEN', nombre_comercial: 'PARACETAMOL SUP 125MG' },
  ];
  const idxMol = construirIndiceMolecula(dbShape);
  const r1 = candidatoNuevoEnlace('ACICLOVIR 1000MG', 'ACICLOVIR TAB AP 1000MG X10 CR LATT', dbShape, idxMol);
  assert.ok(r1 && r1.producto.id === 1 && r1.score >= 0.72);
  const r2 = candidatoNuevoEnlace('ACETAMINOFEN 125MG', 'ACETAMINOFEN SUP 125MG X6 ALESS', dbShape, idxMol);
  assert.ok(r2 && r2.producto.id === 2 && r2.score >= 0.72);
  assert.equal(candidatoNuevoEnlace('NOMBRE SIN CANDIDATO REAL', 'ALGO GENERICO 100 MG', dbShape, idxMol), null);
});

test('candidatoNuevoEnlace: desambigua una combinacion por nombre comercial', () => {
  // PA 'MONTELUKAST 50MG' da score de molecula 1.0 contra Airon Duo
  // (DESLORATADINA-MONTELUKAST) y Airon 5mg; la dosis del PA está MAL (dice 50)
  // y la descripción COBECA dice 5MG -> el score combinado con el nombre
  // comercial debe elegir 'AIRON 5 MG TABLETAS MASTICABLES' (id=7).
  const dbShape = [
    { id: 6, molecula: 'DESLORATADINA - MONTELUKAST', nombre_comercial: 'AIRON DUO TABLETAS RECUBIERTAS' },
    { id: 7, molecula: 'MONTELUKAST', nombre_comercial: 'AIRON 5 MG TABLETAS MASTICABLES' },
  ];
  const idxMol = construirIndiceMolecula(dbShape);
  const r = candidatoNuevoEnlace(
    'MONTELUKAST 50MG',
    'AIRON TAB MAST PED 5MG X30 L.O',
    dbShape,
    idxMol,
  );
  assert.ok(r && r.producto.id === 7, `candidato=${JSON.stringify(r && r.producto)} score=${r && r.score}`);
});

test('emparejarConDroven: filtra por marca y dosis y elige el mejor scoreNombre', () => {
  const drovenRows = [
    { f: { descripcion: 'ABRETIA 10MG 10CAPS ATOMOXETINA', principioActivo: 'ATOMOXETINA 10MG' }, e: { estado: 'matched', producto: { ef: 'E.F.A1' } } },
    { f: { descripcion: 'ABRETIA 18MG 10CAPS ATOMOXETINA', principioActivo: 'ATOMOXETINA 18MG' }, e: { estado: 'matched', producto: { ef: 'E.F.A2' } } },
    { f: { descripcion: 'NOLVADEX 20MG TAB', principioActivo: 'TAMOXIFENO' }, e: { estado: 'matched', producto: { ef: 'E.F.B1' } } },
  ];
  const par1 = emparejarConDroven('ABRETIA CAP 18MG X10 MEG', drovenRows);
  assert.ok(par1 && par1.f.descripcion.includes('18MG') && par1.e.producto.ef === 'E.F.A2');
  const par2 = emparejarConDroven('ABRETIA CAP 10MG X10 MEG', drovenRows);
  assert.ok(par2 && par2.f.descripcion.includes('10MG'));
  assert.equal(emparejarConDroven('ABRETIA CAP 7.5MG X10 MEG', drovenRows), null);
  const par3 = emparejarConDroven('NOLVADEX 20MG TAB X30', drovenRows);
  assert.ok(par3 && par3.e.producto.ef === 'E.F.B1');
  assert.equal(emparejarConDroven('TAMOXIFENO 20MG X30', drovenRows), null);
});

test('emparejarConDroven: mismo marca+dosis, elige el de mejor descripcion', () => {
  const drovenRows = [
    { f: { descripcion: 'AMOCLIN 500MG 10CAPS AMOXICILINA', principioActivo: 'AMOXICILINA' }, e: { estado: 'matched', producto: { ef: 'E.F.C1' } } },
    { f: { descripcion: 'AMOCLIN SUSP 500MG 100ML', principioActivo: 'AMOXICILINA' }, e: { estado: 'matched', producto: { ef: 'E.F.C2' } } },
  ];
  const par = emparejarConDroven('AMOCLIN CAP 500MG X10 ZUZU', drovenRows);
  assert.ok(par && par.f.descripcion.includes('10CAPS'));
});

test('dosisCoincideConProducto: rechaza dosis legibles y distintas', () => {
  const prod50 = { molecula: 'MONTELUKAST', nombre_comercial: 'MONTELUKAST 50MG COMPRIMIDO' };
  assert.equal(dosisCoincideConProducto('AIRON TAB MAST PED 5MG X30 L.O', prod50), false);
  const prod5 = { molecula: 'MONTELUKAST', nombre_comercial: 'MONTELUKAST 5MG COMPRIMIDO' };
  assert.equal(dosisCoincideConProducto('AIRON TAB MAST PED 5MG X30 L.O', prod5), true);
  assert.equal(dosisCoincideConProducto('AFLAMAX TAB REC 50MG X10', { molecula: 'DICLOFENAC SODICO', nombre_comercial: 'VOLTAREN 50MG TABLETA' }), true);
  assert.equal(dosisCoincideConProducto('ACEITE HIGADO BACALAO X 120ML', { molecula: 'ACEITE DE HIGADO DE BACALAO', nombre_comercial: 'ACEITE' }), true);
});

test('rescatarCobeca: camino aCostoExistente vs nuevoEnlace vs null', () => {
  const dbShape = [{ id: 1, ef: 'E.F.DICLO', molecula: 'DICLOFENAC SODICO', nombre_comercial: 'VOLTAREN 50MG TABLETA' }];
  const idxMol = construirIndiceMolecula(dbShape);
  const drovenRows = [
    { f: { descripcion: 'AFLAMAX 50MG 10TABS DICLOFENAC', principioActivo: 'DICLOFENAC SODICO 50MG' }, e: { estado: 'matched', producto: { ef: 'E.F.D1', molecula: 'DICLOFENAC SODICO', nombre_comercial: 'AFLAMAX 50MG TABLETA' } } },
    { f: { descripcion: 'CREMA DICLOFENAC 50MG X 20G', principioActivo: 'DICLOFENAC SODICO 50MG' }, e: { estado: 'sin_candidato', motivo: 'lab' } },
  ];
  const r1 = rescatarCobeca({ desc: 'AFLAMAX TAB REC 50MG X10 L.O', costo: 1.5, drovenRows, dbShape, idxMol });
  assert.equal(r1.camino, 'aCostoExistente');
  assert.equal(r1.ef, 'E.F.D1');
  const r2 = rescatarCobeca({ desc: 'CREMA DICLOFENAC 50MG X20G MEG', costo: 2.0, drovenRows, dbShape, idxMol });
  assert.equal(r2.camino, 'nuevoEnlace');
  assert.equal(r2.ef, 'E.F.DICLO');
  const r3 = rescatarCobeca({ desc: 'ACEITE COCO X 500ML', costo: 1, drovenRows, dbShape, idxMol });
  assert.equal(r3, null);
  // Sin fila Drovencentro para marca+dosis 25MG -> null
  const r4 = rescatarCobeca({ desc: 'AFLAMAX TAB REC 25MG X10 L.O', costo: 1.5, drovenRows, dbShape, idxMol });
  assert.equal(r4, null);
});

test('rescatarCobeca: hereda enlace con nombre disimil (Airon Duo) si el PA re-enlaza bien', () => {
  // droven enlazó 'AIRON PED 5MG' al ef equivocado E.F.DUO (Airon Duo, nombre muy
  // distinto) por PA 'MONTELUKAST 50MG'. scoreNombre(desc, Duo) es bajo -> cae a
  // 'nuevoEnlace' y debe terminar en E.F.5MG (AIRON 5 MG TABLETAS MASTICABLES).
  const dbShape = [
    { id: 6, ef: 'E.F.DUO', molecula: 'DESLORATADINA - MONTELUKAST', nombre_comercial: 'AIRON DUO TABLETAS RECUBIERTAS' },
    { id: 7, ef: 'E.F.5MG', molecula: 'MONTELUKAST', nombre_comercial: 'AIRON 5 MG TABLETAS MASTICABLES' },
  ];
  const idxMol = construirIndiceMolecula(dbShape);
  const drovenRows = [
    { f: { descripcion: 'AIRON 5MG TABLETAS MASTICABLES', principioActivo: 'MONTELUKAST 50MG' }, e: { estado: 'matched', producto: { ef: 'E.F.DUO' } } },
  ];
  const r = rescatarCobeca({ desc: 'AIRON TAB MAST PED 5MG X30 L.O', costo: 7.56, drovenRows, dbShape, idxMol });
  assert.equal(r.camino, 'nuevoEnlace');
  assert.equal(r.ef, 'E.F.5MG');
});

test('rescatarCobeca: rechaza falsos positivos de componente (WAMPOLE/LANOLZINC)', () => {
  // WAMPOLE emulsion -> PA 'ACEITE DE HIGADO DE BACALAO,VIT A,D,E,B' da score de
  // molecula 0.75 contra LANOLZINC (contiene solo ese componente) y el nombre
  // comercial no coincide -> score combinado < umbral -> null.
  const dbShape = [{ id: 9, ef: 'E.F.6.400', molecula: 'OXIDO DE ZINC - ACEITE DE HIGADO DE BACALAO', nombre_comercial: 'LANOLZINC 15% 11% POMADA' }];
  const idxMol = construirIndiceMolecula(dbShape);
  const drovenRows = [
    { f: { descripcion: 'WAMPOLE 200ML ACEITE BACALAO', principioActivo: 'ACEITE DE HIGADO DE BACALAO,VIT A,D,E,B' }, e: { estado: 'sin_candidato', motivo: 'lab' } },
    { f: { descripcion: 'VITALAC 120ML ACEITE BACALAO', principioActivo: 'ACEITE DE HIGADO DE BACALAO' }, e: { estado: 'sin_candidato', motivo: 'lab' } },
  ];
  const r1 = rescatarCobeca({ desc: 'WAMPOLE EMUL FRESA 200ML PONCE', costo: 3.49, drovenRows, dbShape, idxMol });
  assert.equal(r1, null, 'WAMPOLE contra LANOLZINC (PA con VIT)');
  // VITALAC: registro LANOLZINC es combinacion y el nombre no se parece -> null
  const r2 = rescatarCobeca({ desc: 'VITALAC KIDS SOL ORAL 120ML B&M', costo: 2.86, drovenRows, dbShape, idxMol });
  assert.equal(r2, null, 'VITALAC contra LANOLZINC (registro combinacion, nombre disimil)');
});