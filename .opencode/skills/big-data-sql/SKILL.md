---
name: big-data-sql
description: Instrucciones optimizadas para procesar archivos CSV gigantescos mediante SQL nativo y scripts eficientes en memoria.
---

# Big Data SQL & CSV Processing Skill

## Cuándo usar esta skill
- El usuario te pide analizar, filtrar, agrupar o transformar archivos CSV de gran tamaño (grandes volúmenes de datos).
- El usuario quiere ejecutar consultas de tipo SQL sobre archivos locales planos sin levantar una base de datos tradicional.

## Instrucciones de ejecución (Reglas estrictas)
1. **PROHIBIDO leer el CSV directamente:** Nunca uses comandos de terminal como `cat`, `grep` o `awk` para leer archivos masivos, ni intentes imprimir el contenido completo en el chat.
2. **Usa DuckDB como primera opción:** Para cualquier consulta analítica tipo SQL sobre el CSV, genera y ejecuta un script de Python o comando de consola utilizando DuckDB. 
   - *Ejemplo en Python:* `import duckdb; duckdb.sql("SELECT * FROM 'archivo.csv' WHERE...").show()`
3. **Usa Polars si requieres manipulación avanzada:** Si se necesita reestructurar datos complejos en formato dataframe, escribe un script de Python con la librería `polars` usando `pl.scan_csv()` (LazyFrame) para no saturar la memoria RAM. Evita `pandas` para archivos a gran escala.
4. **Muestra solo muestras agregadas:** Al devolver resultados en la interfaz de OpenCode, muestra únicamente las primeras 10-20 filas o el resumen estadístico final.

## Ejemplos de uso
- "Agrupa las ventas del CSV por región y calcula el promedio con SQL" -> El agente creará un subproceso con DuckDB invocando `SELECT region, AVG(ventas) FROM 'datos.csv' GROUP BY region`.
