import { DuckDBInstance } from '@duckdb/node-api';

const inst = await DuckDBInstance.create();
const conn = await inst.connect();
await conn.run(`INSTALL excel;`);
await conn.run(`LOAD excel;`);

for (const [label, path] of [['COBECA', 'data/inventario-cobeca.xlsx'], ['DROVEN', 'data/inventario-drovencentro.XLS']]) {
  console.log(`\n========== ${label} ==========`);
  const q = await conn.runAndReadAll(`SELECT * FROM read_xlsx('${path}', header=true) LIMIT 2`);
  console.log('columnas:', q.getRowObjects().length ? Object.keys(q.getRowObjects()[0]).join(' | ') : '(0 filas)');
  for (const r of q.getRowObjects()) console.log(JSON.stringify(r));
}
await conn.close();