# AGENTS.md — Backend (drogueria-carrisan-backend)

## Comandos

```bash
npm run dev      # Desarrollo con nodemon (src/server.js)
npm run start    # Produccion (node src/server.js)
```

## Stack

- Express 5 (Node.js) con ES Modules
- Supabase (PostgreSQL) via @supabase/supabase-js — NO hay ORM
- JWT (jsonwebtoken) para autenticacion
- Cloudflare Turnstile para proteccion anti-bot
- web-push (VAPID) para notificaciones push
- Multer + Sharp para subida y procesamiento de imagenes
- Helmet para security headers
- express-rate-limit (5 limiters distintos)
- node-cron para tareas programadas
- bcrypt para hashing de contrasenas

## Estructura src/

```
src/
├── server.js                  # ENTRY POINT — Express app + rutas + middleware
├── config/supabase.js         # Cliente Supabase (createClient con env vars)
├── controllers/               # Logica de negocio (33 archivos)
├── routes/                    # Definicion de endpoints (30 archivos)
├── middleware/                 # auth.js, Ratelimit.js, soloAdmin.middleware.js, staffAuth.js (JWT staff interno)
├── services/                  # push.service.js (web-push)
├── jobs/                      # Tareas cron (limpiezaNotificaciones, revisarVencimientos)
├── migrations/                # SQL de migraciones (010-013) + scripts de import
└── utils/                     # turnstile.js (verificacion anti-bot)
```

## Arquitectura

### Patron: Routes → Controllers → Supabase
No hay modelo ni capa de abstraccion. Cada controller importa `supabase` desde config y hace queries directas:

```js
const { data, error } = await supabase
  .from('productos')
  .select('*')
  .eq('activo', true)
```

Si necesitas entender la schema de la DB, mira los controllers (los nombres de columnas aparecen en las queries) o las migraciones SQL.

### Rutas registradas en server.js (30 de 30)

Todos los archivos de `routes/` estan importados y montados en `server.js`: `/auth`, `/marcas`, `/products`, `/prices`, `/orders`, `/users`, `/admin/codigos-invitacion`, `/descuentos`, `/facturas`, `/pagos`, `/reportes-pago`, `/clientes`, `/notifications`, `/lists`, `/direcciones`, `/favoritos`, `/uploads`, `/moleculas`, `/staff`, `/delivery-tarifas`, `/requerimientos`, `/cotizaciones`, `/documentos`, `/chat`, `/presupuestos`, `/subusuarios`, `/admin/analytics`, `/push`, `/promociones`, y `/products` (valoraciones, junto al router de productos).

Si agregas un endpoint nuevo, recuerda importar y montar el archivo de rutas en `server.js`.

### Autenticacion JWT

1. Login → POST /auth/login retorna token JWT
2. Token se envia como `Authorization: Bearer <token>`
3. Middleware `verifyJWT` decodifica y verifica:
   - Que el token sea valido (jwt.verify)
   - Que el usuario exista y este activo en la DB
   - Que la `token_version` del payload coincida con la de la DB (para revocacion)
4. Si la version no coincide → 401 "Sesion revocada"
5. Para logout, se incrementa `token_version` en la DB → todos los tokens anteriores quedan invalidos

### Autenticacion de personal interno (staff)

Login aparte para trabajadores de la empresa (vendedores, despachadores, almacenistas, contabilidad, administradores, directores), separado del login de clientes (`/auth`).

- Rutas bajo `/staff`:
  - `routes/staff.routes.js` + `controllers/staff.controller.js` — login, despacho, órdenes a cliente, bridge admin.
  - `routes/staff.almacen.routes.js` + `controllers/almacen.controller.js` — aprobación de órdenes, colas de revisar/preparar, envío.
  - `routes/staff.contabilidad.routes.js` + `controllers/contabilidad.controller.js` — estado de cuenta, pagos, facturas, reportes de pago. `createFactura` acepta además `tipo` ('factura'|'nota_credito'|'nota_debito'), `factura_referencia_id` y `motivo` para **notas de crédito/débito** — requiere la migración `012_facturas_tipo_notas.sql` (columna `tipo` en `facturas`).
  - `middleware/staffAuth.js` — `verifyStaffJWT` + `checkRolStaff([...])`.
- Tabla propia `staff` (no `users`), con `rol` en (`vendedor`, `despachador`, `almacenista`, `contabilidad`, `administrador`, `director`, `admin`) y su propio `token_version`. Ver migraciones `008_staff.sql`, **`009_roles_staff.sql`** (amplía el CHECK de rol), **`010_ordenes_items_anulado.sql`** (aprobación de órdenes: `anulado` + `nota_anulacion`) y **`012_facturas_tipo_notas.sql`** (facturas: `tipo`/`factura_referencia_id`/`motivo` para notas).
- **Roles**: `vendedor` (crear órdenes), `despachador` (despacho), `almacenista` (aprobación y preparación de órdenes), `contabilidad` (cuentas/pagos/facturas), `administrador`/`director`/`admin` (acceso amplio a módulos; `director` ve TODOS los módulos staff). El bridge al `/admin` del dueño es para `administrador`/`director`/`admin`.
- El JWT de staff lleva `tipo: 'staff'` + `rol`; el de cliente lleva `es_admin`. `verifyStaffJWT` rechaza cualquier token sin `tipo === 'staff'` aunque compartan `JWT_SECRET` — un token de cliente nunca pasa por rutas de staff.
- **Endpoints `/staff`**:
  - `POST /staff/login` — login interno (bcrypt + JWT 3d).
  - `POST /staff/registro` — registro de personal con código de invitación `tipo='staff'` (generado en `/admin/codigos-invitacion` con su `rol_staff` incrustado). Inserta en la tabla `staff` con `rol` del código, consume el código atómicamente y devuelve `{ token, staff }` (auto-login). El rol NUNCA sale del body.
  - `GET /staff/despacho`, `PATCH /staff/despacho/:id/entregar` — cola `enviado` → `entregado`.
  - `POST /staff/ordenes` — vendedor crea pedido a nombre de un cliente (usa `construirOrden` con `creado_por_staff_id`).
  - `POST /staff/admin-bridge` — staff admin/director recibe un JWT de CLIENTE válido para entrar al panel `/admin` (empareja por email con cuenta `users` `es_admin=true`).
  - **`/staff/almacen`** (`almacenista/administrador/director/admin`): `GET /revisar` (cola `pedido_creado` con items y stock), `GET /preparar` (cola unificada `preparando`+`procesando` legacy); `PATCH /:id/aprobar` (ajusta cantidades, anula items agotados con nota, recalcula `total_usd` y pasa directo a `preparando`; contado queda con `estado_pago='esperando'`, crédito con `fecha_vencimiento`); `PATCH /:id/cancelar` (solo `pedido_creado`/`preparando`); `PATCH /:id/enviado` (solo `delivery`/`envio_nacional` en `preparando` + pago autorizado); `PATCH /:id/listo-para-retiro` (solo `retiro` en `preparando` + pago autorizado). Usa `validarTransicion`/`aplicarCambioEstado` de `ordenes.controller.js` (contexto: `tipo_envio`, `forma_pago`, `estado_pago`). OJO: NO existe `PATCH /:id/preparando` — pasar a `preparando` ya lo hace la aprobación; `procesando→preparando` legacy queda exclusivo de la verificación de pago de contabilidad.
  - **`/staff/contabilidad`** (`contabilidad/administrador/director/admin`): `GET /clientes` (resumen), `GET /clientes/:id` (detalle), `GET /clientes/:id/comparativa`, `GET /clientes/:id/sin-facturar`; `GET|POST /pagos`, `DELETE /pagos/:id`; `GET|POST /facturas` (POST acepta `tipo`/`factura_referencia_id`/`motivo` para notas con la migración 012), `PATCH|DELETE /facturas/:id`; `GET /reportes-pago`, `PATCH /reportes-pago/:id/verificar`, `PATCH /reportes-pago/:id/rechazar`. Duplica la lógica de `/admin` (facturas/pagos/estadocuenta/reportes) pero con sesión staff; **`created_by` = `req.staff.id`** (en pagos/facturas/reportes). No toca los controllers de `/admin`. Las páginas de Finanzas del frontend (Ventas, Cuentas por cobrar, Pagos, Órdenes por cancelar) consumen estos endpoints SIN cambios de ruta.
- Frontend: `src/pages/staff/` (StaffLogin, StaffDashboard, StaffAlmacen, StaffDespacho, StaffOrdenes, StaffVentas, StaffCuentasPorCobrar, StaffPagos, StaffOrdenesPorCancelar), `src/components/staff/` (LayoutStaff + NavStaff, sidebar persistente), `src/context/StaffAuthContext.jsx`, `src/api/staffAxios.js` (token propio `staff_token`, sesion independiente de la de cliente), `src/components/PrivateRouteStaff.jsx`.
- **Orden de montaje en `server.js`**: `/staff/almacen` y `/staff/contabilidad` se montan ANTES de `/staff` (llegan antes que el router base).

**Importante**: la tabla `staff` y la columna `ordenes.creado_por_staff_id` NO existen en una BD sin ejecutar la migracion `008_staff.sql`; los roles nuevos (`almacenista`, `contabilidad`, `director`) no funcionan sin `009_roles_staff.sql`. El módulo de aprobación (ajustar cantidades / anular items) no funciona sin `010_ordenes_items_anulado.sql`, y las notas de crédito/débito de Ventas no funcionan sin `012_facturas_tipo_notas.sql`.

### Pipeline de estados de órdenes (relevante para staff)

**REGLA CENTRAL** (ver AGENTS.md raíz, sección "Arquitectura de ordenes"): `ORDER STATUS ≠ PAYMENT STATUS ≠ FULFILLMENT METHOD`. Tres campos independientes en `ordenes`: `estado` (logística), `estado_pago` (pago), `tipo_envio` (retiro/delivery/envio_nacional). NUNCA combinar las dimensiones en un enum gigante.

**ESTADO ACTUAL del código** (2026-09-05): pipeline **sin `procesando`** como estado logístico; es LEGACY y se normaliza a `preparando` al vuelo (`normalizarEstado`). Flujo por `tipo_envio`: `pedido_creado → preparando → enviado → entregado` (delivery/envio_nacional) o `pedido_creado → preparando → listo_para_retiro → retirado` (retiro). `cancelado` es terminal. `TRANSICIONES_PERMITIDAS` en `ordenes.controller.js` valida transición + fulfillment (`FULFILLMENT_REQUERIDO`: enviado/entregado solo delivery/envio_nacional; listo_para_retiro/retirado solo retiro) + pago autorizado (`REQUIERE_PAGO_AUTORIZADO`: `forma_pago='credito'` o `estado_pago='verificado'`). Órdenes legacy sin `tipo_envio` NO se bloquean (check condicional). Al aprobar hacia `preparando` se calcula `fecha_vencimiento` para crédito.

**Aprobación de órdenes (flujo actual)**: toda orden nace en `pedido_creado`. El almacenista la aprueba (`PATCH /staff/almacen/:id/aprobar`) → pasa directo a `preparando`. El pago es condición, no estado:
- **Crédito** → `preparando` con `fecha_vencimiento`, sin reporte de pago.
- **Contado** → `preparando` con `estado_pago='esperando'`; el almacén no puede despachar hasta que contabilidad verifique (`estado_pago='verificado'`).

La cola "Por preparar" del almacén (`GET /staff/almacen/preparar`) toma `preparando` (+ legacy `procesando`) y filtra por pago autorizado; en el frontend muestra badge "Pendiente de pago" si `forma_pago` es contado y `estado_pago !== 'verificado'`. El frontend usa como fuente única de labels `drogueria-carrisan-frontend/src/config/estadosOrden.js` (PROHIBIDO duplicar estados en componentes).

### Módulo de aprobación/confirmación de órdenes (IMPLEMENTADO — 2026-09-04)

Se construyó el flujo de aprobación del almacenista. Docs: `analisis/2026-09-04-aprobacion-ordenes-almacenista-design.md` y `analisis/2026-09-04-aprobacion-ordenes-almacenista-plan.md`. Resumen de lo agregado:

- Migración `010_ordenes_items_anulado.sql`: `anulado BOOLEAN` + `nota_anulacion TEXT` en `ordenes_items` (auditoría — el item no se borra, el total excluye anulados).
- `almacen.controller.js`: `getColaRevisar`, `getColaPreparar`, `aprobarOrden` (ajusta cantidades/anula/recalcula total y notifica si hubo cambios), `cancelarOrden`, `marcarEnviado` y `marcarListoParaRetiro`. Se ELIMINARON `getColaAlmacen` y `marcarPreparando` — no reintroducirlos.
- `ordenes.controller.js`: `validarTransicion` (transición + fulfillment + pago autorizado), `normalizarEstado` (mapeo legacy), `aplicarCambioEstado` y `getDeliveryPendientes` (devuelve `{ pendientes, enviadosRecientes }` filtrando por pago autorizado).
- `contabilidad.controller.js` + rutas: `GET /staff/contabilidad/ordenes-procesando` (contado esperando pago) y `PATCH /staff/contabilidad/ordenes/:id/cancelar` (módulo "Órdenes por cancelar" en el frontend).
- Frontend: `StaffAlmacen.jsx` con tabs "Por revisar" / "Por preparar" (badge de pago pendiente, botón "Marcar listo para retiro" para retiro o "Marcar como enviado" para delivery) y `StaffOrdenesPorCancelar.jsx` con la cola de cancelación.

Ideas pendientes (ver `analisis/plan-modulos-staff-por-rol.md`): proveedores, estadísticas separadas del staff, historial de actividad de aprobación (quién ajustó/anuló qué), y asegurar notificación por item anulado cuando ya hay cambios.

### Catálogo de productos INHRR (PLAN APROBADO — 2026-09-05)

Objetivo: crear un catálogo público de consulta (`productos_catalogo`) basado en `data/productos_inhrr.csv` (22,720 registros del INHRR — Instituto Nacional de Higiene "Rafael Rangel"), separado del inventario real (`productos`), con purga de vencidos, SKU interno con categorías y enlace a moléculas/ATC.

**Datos crudos**: `data/productos_inhrr.csv` (22,720 filas, columnas: `ef, id, nombre, principioActivo, dci, concentracion, formaFarmaceutica, viaDeAdministracion, tipoVenta, representante, rifRepresentante, patrocinante, fabricante, fechaAprobado, fechaVigencia, fechaCancelado`). También existe `data/productos_inhrr.json` (versión completa, ~2M lines) y `data/progreso.json` (seguimiento de importación previa — no bloquear). Datos auxiliares: `data/atc_clasificaciones_import.csv` y `data/moleculas_referencias_import.csv` (ya importados en BD).

**Decisiones de diseño (confirmadas con el dueño):**
1. **Purga**: filtrar por `fechaVigencia` (fecha de vencimiento del registro sanitario). Se eliminan los que ya vencieron. Los 1,031 sin `fechaVigencia` se INCLUYEN inicialmente (el dueño los revisa y purga manualmente después).
2. **SKU interno**: NO es consecutivo — es el MISMO número de registro sanitario, así queda una referencia directa. Formato: `{CATEGORIA}{nº}` (ej. `E.F.45.256` → `ME45256`). El número se toma del `sortId` del JSON (= dígitos del `ef`). Los productos `P.B.`/`P.F.` conservan su mismo código con números ≤ 1.000 (ej. `P.B.1.173` → `HO1173`). Categorías: `ME` (medicamentos), `HO` (hospitalarios — inyectables), `MM` (material médico — jeringas en blanco, gasas, guantes), `MI` (misceláneos — resto). Excepciones manuales las resuelve el dueño.
3. **Consulta**: página pública de lectura con filtros avanzados (búsqueda por nombre, filtrar por molécula, laboratorio, forma farmacéutica, categoría). Sin auth.
4. **Moléculas**: `principioActivo` puede traer varias moléculas separadas por `" - "` (ej. `ROSUVASTATINA - EZETIMIBA`) → crear múltiples registros en la bridge table. Matching contra `moleculas_referencias.nombre` con fuzzy match (pg_trgm). El ATC se enlaza vía molécula, NO por producto.
5. **Estructura**: tabla separada `productos_catalogo` (NO mezclar con `productos`). Re-importación periódica (~6 meses): subir CSV nuevo, actualizar/insertar/desactivar por coincidencia de `ef`. El cruce de productos nuevos contra el inventario es una etapa futura.

**Calidad de datos (analizado 2026-09-05 con DuckDB):**
- CSV: 22,706 registros, `ef` único al 100%. `principioActivo` presente en 17,447 (2,006 distintos).
- **Purga**: 15,289 vencidos → quedan 6,386 vigentes + 1,031 sin fecha = **7,417 a importar**.
- **CRÍTICO**: `concentracion`, `formaFarmaceutica`, `viaDeAdministracion`, `tipoVenta` y `dci` están 100% VACÍOS en el CSV/JSON (el scraper no los capturó). La forma/presentación se deriva parseando el campo `nombre` durante la importación.
- **Categorización**: usar fuzzy matching (pg_trgm) contra keywords, NO `position()` exacto, porque el INHRR tiene typos (UNGUUUENTO, COMPRMIDOS, SUSPENCION, JERIRGA, INYECATBLE). Además: normalizar acentos (también `ü`→u, `ó`→o). El matching se hace TOKEN a TOKEN (cada palabra del `nombre` contra las keywords), no contra el nombre completo. `JERINGA PRELLENADA` con medicamento → **HO** (EPREX, BOOSTRIX); MM solo para material puro (gasas, algodón, guantes — SIN keywords tipo sonda/sutura/venda/catéter porque falsean positivos en nombres de medicamentos). Mejorar reglas para: inhaladores/aerosol (ME), `POLVO LIOFILIZADO` (HO/ME según contexto `para suspension`→ME), `ANILLO VAGINAL`, `SOLUCION OTICA`, `GRANULADO`, `SOLUCION ELECTROLITICA USO ORAL` (ME).
- **Colisiones de SKU (analizado 2026-09-05)**: como `E.F`, `E.F.G`, `P.B`, `P.F`, `P.F.G` comparten la misma numeración, hay **10 grupos** donde un mismo número cae en la misma categoría tras la purga (HO931, HO990, HO1102, HO1161, HO1184, HO1370, ME1406, HO1466, ME42605, ME43668). 1 es duplicado real del mismo producto (SEMGLEE → `E.F.1.466` y `P.B.1.466`), el resto son productos distintos (ej. MABTHERA vs AGUA DESTILADA en `HO931`). **Resolución (decisión del dueño 2026-09-05): suffix A/B determinístico** — dentro de un grupo `(categoría, número)`, si el `nombre` normalizado es idéntico se fusiona (queda el registro con `ef` menor, ej. SEMGLEE → solo `E.F.1.466`), y si son productos distintos el primero por orden de `ef` conserva el SKU base (`HO931`) y los demás reciben sufijo de letra (`HO931B`, `HO931C`). La regla es estable entre re-importaciones porque el `ef` no cambia.

**Fases pendientes:**
1. `scripts/importar-catalogo.mjs` — script DuckDB (`@duckdb/node-api`, ya instalado): lee CSV, purga vencidos, infiere categoría, genera SKU, separa principioActivo, exporta limpio. NO leer el CSV directamente (regla de la skill `big-data-sql`).
2. `src/migrations/014_productos_catalogo.sql` — tablas `productos_catalogo` + `catalogo_moleculas` (bridge N:N con `moleculas_referencias`), índices GIN para nombre (pg_trgm) y búsqueda.
3. `src/controllers/catalogo.controller.js` — `getCatalogo` (lista paginada + filtros: `q`, `molecula`, `laboratorio`, `forma`, `categoria`), `getProductoCatalogo` (ficha), `getCatalogoMetadata` (valores distintos para filtros).
4. `src/routes/catalogo.routes.js` — montar `/catalogo` en `server.js` (público, sin auth).
5. Frontend: `Catalogo.jsx` + componentes de filtros/tarjetas/ficha en `/catalogo`.
6. Ejecutar migración en Supabase + correr el script de importación.

### Rate Limiting (5 limiters)

| Limiter | Ventana | Max requests | Donde se usa |
|---------|---------|-------------|--------------|
| authLimiter | 15 min | 10 | Todas las rutas /auth |
| apiLimiter | 15 min | 300 | Todas las demas rutas |
| uploadsRegistroLimiter | 15 min | 15 | Subida de archivos en registro |
| pushLimiter | 15 min | 10 | Suscripcion a push |
| resetPasswordLimiter | 15 min | 5 | Reset de contrasena |

### Middleware de admin
- `verifyJWT` + `verifyAdmin` (en auth.js)
- `soloAdmin` (en soloAdmin.middleware.js) — alternativa más simple, verifica `req.user.es_admin`

## Controllers principales

| Controller | Responsabilidad |
|-----------|----------------|
| auth.controller.js | Login, registro, check-email, verificar-codigo, reset-password |
| productos.controller.js | CRUD de productos, busqueda, filtros, stock |
| ordenes.controller.js | Crear/confirmar/cancelar/estado de ordenes |
| pagos.controller.js | Registrar pagos, verificar, rechazar |
| facturas.controller.js | Generar facturas, asociar a ordenes |
| estadocuenta.controller.js | Estado de cuenta de clientes, saldos, ampliacion de credito |
| notificaciones.controller.js | CRUD de notificaciones in-app |
| push.controller.js | Suscripcion/desuscripcion a web push |
| users.controller.js | Perfil de usuario, subusuarios |
| listas.controller.js | Listas personalizadas de productos (favoritos, compras recurrentes) |
| descuentos.controller.js | Descuentos y promociones |
| moleculas.controller.js | Gestion de moleculas activas (dataset medico) |
| imagesUpload.controller.js | Subida de imagenes (Multer + Sharp) |
| cotizaciones.controller.js | Solicitudes de cotizacion |
| requerimientos.controller.js | Requerimientos/requerimientos de compra |
| documentos.controller.js | Documentos adjuntos |
| chat.controller.js | Mensajes de chat cliente-empresa |
| staff.controller.js | Login interno (staff), cola de despacho, crear orden a cliente, bridge al admin |

## Migraciones SQL

Ubicacion: `src/migrations/` (010-013)

Las migraciones son SQL plano. NO hay sistema de migraciones automatico — se ejecutan manualmente en Supabase SQL Editor.

| Archivo | Que hace |
|---------|----------|
| 010_ordenes_items_anulado.sql | Aprobación de órdenes: columnas `anulado` + `nota_anulacion` en `ordenes_items` |
| 011_codigos_invitacion_tipo_staff.sql | Códigos de invitación: columnas `tipo` ('honorifico'\|'staff') + `rol_staff` para códigos de staff |
| 012_facturas_tipo_notas.sql | Facturas: columnas `tipo` ('factura'\|'nota_credito'\|'nota_debito'), `factura_referencia_id` y `motivo` para notas de crédito/débito (Ventas) |
| 013_poblarvademecum.sql | Poblado masivo de `atc_clasificaciones` (7,353 códigos ATC, árbol niveles 1-5) y `moleculas_referencias` (4,232 moléculas) desde CSVs de `data/` con resolución padre-hijo |

**NOTA**: Las migraciones 002-009 ya NO existen como archivos (fueron consolidadas/aplicadas directamente en Supabase). La tabla principal `users` tampoco esta en estas migraciones — fue creada directamente en Supabase. Si necesitas ver su schema, busca las queries en los controllers (especialmente auth.controller.js y users.controller.js).

## Variables de entorno necesarias

```
PORT=5000
SUPABASE_URL=
SUPABASE_KEY=
JWT_SECRET=
NODE_ENV=production
FRONTEND_URL=http://localhost:5173
TURNSTILE_SECRET_KEY=
VAPID_SUBJECT=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

## CORS

Configurado via `FRONTEND_URL` (comma-separated para multiples origenes). En desarrollo defaultea a `http://localhost:5173`.

## Cosas a tener en cuenta

1. **No hay ORM**. Cada query es inline en el controller. Si cambias una tabla en Supabase, busca todos los controllers que la referencien.
2. **Express 5** (no 4). Las firmas de middleware/rutas son iguales pero `req.query` puede comportarse diferente. No asumas Express 4.
3. **Las rutas no protegidas** (como `/products`, `/marcas`) no usan `verifyJWT`. Las protegidas lo usan como primer middleware.
4. **El campo `token_version`** en la tabla `users` es critico para la revocacion de sesiones. Si lo quitas, el logout forzado deja de funcionar.
5. **Uploads** usan Multer (temp storage) + Sharp (resize) + Supabase Storage. Las imagenes se procesan a max 800px.
6. **web-push** necesita VAPID keys generadas. Si cambias las keys, las suscripciones existentes quedan invalidadas.
7. **Las migraciones** no se ejecutan automaticamente. Si agregas una tabla nueva, crea un archivo SQL y ejecutalo manualmente en Supabase.
