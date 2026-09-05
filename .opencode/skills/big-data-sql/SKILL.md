---
name: big-data-sql
description: Instrucciones optimizadas para procesar archivos CSV gigantescos mediante SQL nativo con DuckDB (Node.js) y scripts eficientes en memoria.
---

# Big Data SQL & CSV Processing Skill

## Cuándo usar esta skill
- El usuario te pide analizar, filtrar, agrupar o transformar archivos CSV de gran tamaño (grandes volúmenes de datos).
- El usuario quiere ejecutar consultas de tipo SQL sobre archivos locales planos sin levantar una base de datos tradicional.

## Entorno (importante)
- **NO hay Python instalado**: no uses scripts de Python (`python`, `pandas`, `polars`, `pip install`).
- DuckDB ya está disponible como paquete npm en el backend: `node_modules/@duckdb/node-api` (v1.5.x).
- Ejecuta los scripts desde el directorio del backend (`drogueria-carrisan-backend/`) para que `import '@duckdb/node-api'` resuelva el módulo.

## Instrucciones de ejecución (Reglas estrictas)
1. **PROHIBIDO leer el CSV directamente:** Nunca uses comandos como `cat`, `Get-Content`, `grep` o `awk` para leer archivos masivos, ni intentes imprimir el contenido completo en el chat.
2. **Usa DuckDB (Node.js) como primera opción:** Genera y ejecuta un script ESM (`.mjs`) que importe `@duckdb/node-api`. DuckDB lee el CSV de forma lazy (streaming) y ejecuta el SQL en memoria sin cargar todo el archivo.
   - Ejemplo base:
     ```js
     // consulta.mjs — correr desde drogueria-carrisan-backend/
     import { DuckDBInstance } from '@duckdb/node-api';

     const instance = await DuckDBInstance.create();
     const connection = await instance.connect();
     const res = await connection.runAndReadAll(
       `SELECT region, AVG(ventas) AS promedio
        FROM read_csv('datos.csv', header=true, auto_detect=true)
        GROUP BY 1`
     );
     console.table(res.getRowObjects().slice(0, 20)); // muestra agregada
     ```
   - Consejo: `read_csv('archivo.csv', header=true, auto_detect=true)` o `read_csv_auto('archivo.csv')`.
   - Para revisar el esquema del CSV sin volcarlo: `DESCRIBE SELECT * FROM read_csv('archivo.csv', auto_detect=true)`.
   - Usa `LIMIT` en la query y `getRowObjects()`/`getRows()` para devolver solo una muestra.
3. **Manipulación avanzada:** Si se requiere reestructurar datos complejos, hazlo con SQL de DuckDB (CTEs, window functions, `COPY TO` para exportar resultados) o, si es estrictamente necesario, instala `nodejs-polars` vía npm. Evita cargar el CSV completo en un arreglo de JS.
4. **Muestra solo muestras agregadas:** Al devolver resultados en la interfaz de OpenCode, muestra únicamente las primeras 10-20 filas o el resumen estadístico final.

## Ejemplos de uso
- "Agrupa las ventas del CSV por región y calcula el promedio con SQL" → crea un script ESM con DuckDB invocando `SELECT region, AVG(ventas) FROM read_csv('datos.csv', header=true) GROUP BY region` y muestra el top 20.
- "Cuenta cuántas filas tiene el CSV" → `SELECT count(*) FROM read_csv('datos.csv', header=true, auto_detect=true)`.