import { DuckDBInstance } from '@duckdb/node-api';

const inst = await DuckDBInstance.create();
const conn = await inst.connect();
await conn.run(`INSTALL excel;`);
await conn.run(`LOAD excel;`);

// === COBECA: ver estructura y presentaciones ===
console.log('q1 length:', q1.length);
console.log('q1:', JSON.stringify(q1).slice(0, 500));
await conn.close();

await conn.close();