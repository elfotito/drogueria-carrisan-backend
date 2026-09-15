# productos.md — Contexto de la BD de productos (Drogueria Carrisan)

Documento vivo de trabajo. **Leer SIEMPRE al iniciar cualquier sesión que toque `productos`, `productos_catalogo`, laboratorios o precios.** Cuando el dueño pida un ajuste, usar este contexto: consultar estado → mostrar plan → aplicar → verificar → limpiar → actualizar este archivo.

---

## 1. Cómo conectarse

Backend: `drogueria-carrisan-backend/` (el backend completo, NO `src/`).

- **Credenciales**: viven en `drogueria-carrisan-backend/.env`. Variables:
  - `SUPABASE_URL`, `SUPABASE_KEY` → cliente `@supabase/supabase-js` (la app).
  - `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_NAME`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD` → `pg` (conexión directa, para scripts de mantenimiento).
- **Conexión directa (patrón usado en todas las sesiones)**: script temporal `.mjs` con `node:pg` → `new Client({ host, port, database, user, password })` leídos del `.env`. El host es pooler de Supabase (puerto 5432 = session pooler).
- **⚠️ PowerShell rompe las comillas/backticks en `node -e`** → SIEMPRE usar un script `.mjs` temporal, nunca comandos inline.
- **REGLA DE SEGURIDAD**: NO exponer los valores de `.env` en mensajes ni en este documento. Los scripts temporales llevan credenciales embebidas → **borrarlos al terminar** la tarea (patrón `_*.mjs` en la raíz del backend). Nombrarlos con prefijo `_` (ej. `_ajuste.mjs`).

---

## 2. Modelo de datos (verificado 2026-09-15)

### `productos` — tienda operativa (2,317 filas)

```sql
id                       integer PK
nombre_comercial         varchar NOT NULL
descripcion              text NULL
marca_id                 integer NULL -> marcas(id)
precio_usd               numeric NULL      -- NULL = sin precio ("consultar precio")
foto_url                 text NULL
activo                   boolean NULL
created_at / updated_at  timestamp
molecula                 text NULL         -- texto simple para filtro/ficha
linea                    varchar NULL
forma                    varchar NULL
disponible               boolean NULL
requiere_cotizacion      boolean NOT NULL
visible_catalogo         boolean NOT NULL
es_cotizacion            boolean NOT NULL
pais_id                  integer NULL
fuente_inhrr_ef          text NULL         -- LLAVE hacia productos_catalogo.ef
laboratorio              text NULL
costo_usd                numeric NULL      -- = MIN(producto_costos.costo_usd) global
sku                      text NULL         -- UNIQUE parcial (presentación)
presentacion             text NULL
unidades_por_presentacion integer NULL
```

Índices: `activo`, `disponible`, `forma`, `laboratorio`, `linea`, `marca_id`, PK `id`, UNIQUE `sku` (partial WHERE sku IS NOT NULL).

### `productos_catalogo` — registro sanitario INHRR (7,416 filas, solo lectura)

```sql
id                         bigint PK
sku                        text NOT NULL UNIQUE
ef                         text NOT NULL UNIQUE   -- llave idempotente de re-importación
sort_id                    bigint NULL
nombre                     text NOT NULL
forma                      text NULL
categoria                  text NOT NULL          -- ME | HO | MM | MI
principio_activo           text NULL
laboratorio                text NULL
representante / rif_representante / patrocinante / fabricante  text NULL
fecha_aprobado / fecha_vigencia / fecha_cancelado date NULL
activo                     boolean NOT NULL
created_at / updated_at    timestamptz
```

Índices: GIN trigram sobre `nombre` y `laboratorio`, btree `categoria`/`forma`.

> **Solo lectura**: se re-importa periódicamente (~6 meses) con `scripts/cargar-catalogo.sql` (idempotente, upsert por `ef`, desactiva ausentes). NO editar a mano salvo ajustes puntuales pedidos por el dueño.

### Tablas auxiliares

| Tabla | Uso | Filas |
|-------|-----|-------|
| `producto_costos` | Costo POR proveedor: PK `(proveedor, producto_id)`; `costo_usd`; `fecha` | 2,705 (cobeca 1,876 / drovencentro 829) |
| `producto_moleculas` | Bridge N:N productos ↔ moleculas_referencias (`producto_id` integer, `molecula_id` bigint) | 2,128 |
| `catalogo_moleculas` | Bridge N:N productos_catalogo ↔ moleculas_referencias (score) | 6,329 |

### Relación clave
```
productos.fuente_inhrr_ef = productos_catalogo.ef
```
Los 3 productos TRAMAL manuales (ids **39605, 39606, 39611**) NO tienen `fuente_inhrr_ef` → **nunca purgarlos** (datos de prueba del dueño).

---

## 3. Reglas de negocio (decididas con el dueño — NO re-preguntar)

1. **Precio**: `precio_usd = round(costo_usd / 0.6, 2)` (margen 40% sobre venta). Costo global = `MIN(producto_costos.costo_usd)` entre proveedores.
2. **Publicación**: al poner `precio_usd > 0` (admin/staff) el producto se vuelve comprable (`disponible=true`) y dispara el aviso "avísame cuando llegue". `precio_usd` NULL = "consultar precio" (se pide por requerimiento).
3. **`construirOrden` rechaza `precio_usd` NULL/0 aunque `disponible=true`** — no romper nunca el checkout con producto sin precio.
4. **Reconstrucción por presentaciones**: un producto = 1 presentación/SKU. SKU = `ef` base del registro; si hay N≥2 presentaciones → `ef`, `ef/2`, `ef/3`… ordenadas por pack. Clave de presentación = molécula+forma+concentración+laboratorio; el pack (X10/X30) solo genera el sufijo.
5. **Catálogo = solo registros INHRR** que matcheen los excels de proveedores; no se crean productos nuevos. Truco: se vende por SKU de presentación y los costos entran por proveedor (`POST /staff/precios/importar-proveedor`, parser en `src/services/proveedores/`).
6. **No borrar productos demo originales** salvo orden explícita del dueño. Cualquier purge destructiva requiere su OK y queda registrada aquí.

---

## 4. Normalización de laboratorios — estado y reglas aplicadas (2026-09-15)

Se unificaron nombres de laboratorio en `productos` y `productos_catalogo` (aplicar SIEMPRE al mismo valor en ambas tablas). Estado final: **1,130 laboratorios distintos** combinados (productos 291, catálogo 1,130), **0 discrepancias** entre `productos.laboratorio` y su catálogo origen (`catalogo.ef = productos.fuente_inhrr_ef`).

| Regla | Descripción | Resultado |
|-------|-------------|-----------|
| **R1 — General** | Uppercase sin acentos; quitar `/ PAIS` (Venezuela, Colombia, …, admitir lista) y `/ PLANTA ...`; colapsar prefijo duplicado "X - X"; unificar sufijos de empresa: `S.A.E.C.A`, `S.A.C.I`, `S.A.V`, `S.A.S`, `S.A.U`, `S.p.A`, `S.R.L`, `S.L`, `S.A`, `C.A`, `PVT. LTD`, `LTDA`, `PLC`, `CO., LTD`, `LLC`, `AB`, `GMBH`, `KGAA`, `KG`; fix typo `LITD`→`LTD`; quitar código `(12345)` final; quitar punto final sobrante. Dedup por clave **sin comas** (une "ARBOFARMA S.A.S." con "ARBOFARMA, S.A.S." pero NO `C.A.` con `S.A.`). Canónico: forma presente en `productos` con mayor conteo; si no, la más corta. | 1,474 → **1,142** (422 en productos + 2,208 en catálogo actualizadas) |
| **R2 — Singular/plural** | `LABORATORIO X` ↔ `LABORATORIOS X` son el mismo lab → canónico **singular** `LABORATORIO X` (ej. `LABORATORIO BEHRENS, C.A.`). Solo colapsa si existen ambas variantes (no fuerza el singular si solo hay plural). | 1,142 → **1,130** (11 grupos; 86 + 248 filas) |
| **R3 — MEGALABS** | Las 7 variantes puras (`MEGA LABS S.A.`, `MEGA LABS S.A. URUGUAY`, `MEGALABS S.A.`, `MEGALABS URUGUAY S.A.`, `MEGALABS VZL, C.A.`, `MEGALABS VZLA C.A.`, `MEGALABS VZLA, C,A`) → **`MEGALABS S.A.`** (524 filas). | 240 + 273 filas |

**Excepciones que NO se fusionan** (entidades combinadas distintas):
- `MEGALABS VZL, C.A. - LABORATORIOS ROWE, SRL` (3 filas)
- `MEGALABS VZL, C.A. - ACROMAX LABORATORIO QUIMICO FARMACEUTICO S.A.` (1 fila)

---

## 5. Protocolo para ajustes (flujo obligatorio de cada solicitud)

1. **Leer este archivo** primero.
2. **Consultar estado actual** de los datos implicados (¿qué valores existen hoy? ¿en cuántas filas? — en AMBAS tablas) antes de tocar nada.
3. **Mostrar plan / dry-run** con los cambios y filas afectadas. Si hay ambigüedad (¿aplica a catálogo también? ¿cuál canonico elegir? ¿esto es una entidad distinta?), **preguntar** al dueño antes de escribir.
4. **Aplicar** con la técnica probada anti-deadlock (una sola transacción no genera ciclo de locks; el deadlock viene de sesiones concurrentes de Supabase — app/cron/pool):
   - `SET lock_timeout = '3s'`
   - `BEGIN` → **2 UPDATEs masivos** (`UPDATE ... SET laboratorio = v.canon FROM unnest($1::text[], $2::text[]) AS v(orig, canon) WHERE laboratorio = v.orig AND ... IS DISTINCT FROM ...`) → `COMMIT`
   - **Retry en error 40P01** (deadlock): hasta 3 intentos con `sleep(1500)` entre intentos.
5. **Verificar** post-cambio: conteos `COUNT(DISTINCT laboratorio)` por tabla + combinado + cruces incongruentes (`productos` vs su catálogo origen deben ser 0).
6. **Limpiar** los scripts temporales `_*.mjs` (con credenciales) al terminar.
7. **Actualizar este archivo**: nuevo estado de datos + descripción de la regla aplicada.

---

## 6. Pendientes / deudas del dueño (no bloquean)

- **Estado de TRAMAL** (3 productos manuales, ids 39605/39606/39611): decisión pendiente — NO purgar sin aviso.
- CSVs de revisión de moléculas en `data/` (duplicados, sin ATC, overrides, no_match): decisiones manuales del dueño, no bloquean.
- El `/catalogo` de la tienda muestra pills de categoría hardcodeados; los productos nuevos quedan fuera de esos pills (mejora futura, no urgente).