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
├── migrations/                # SQL de migraciones (9 archivos)
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
  - `routes/staff.contabilidad.routes.js` + `controllers/contabilidad.controller.js` — estado de cuenta, pagos, facturas, reportes de pago.
  - `middleware/staffAuth.js` — `verifyStaffJWT` + `checkRolStaff([...])`.
- Tabla propia `staff` (no `users`), con `rol` en (`vendedor`, `despachador`, `almacenista`, `contabilidad`, `administrador`, `director`, `admin`) y su propio `token_version`. Ver migraciones `008_staff.sql`, **`009_roles_staff.sql`** (amplía el CHECK de rol) y **`010_ordenes_items_anulado.sql`** (aprobación de órdenes: `anulado` + `nota_anulacion`).
- **Roles**: `vendedor` (crear órdenes), `despachador` (despacho), `almacenista` (aprobación y preparación de órdenes), `contabilidad` (cuentas/pagos/facturas), `administrador`/`director`/`admin` (acceso amplio a módulos; `director` ve TODOS los módulos staff). El bridge al `/admin` del dueño es para `administrador`/`director`/`admin`.
- El JWT de staff lleva `tipo: 'staff'` + `rol`; el de cliente lleva `es_admin`. `verifyStaffJWT` rechaza cualquier token sin `tipo === 'staff'` aunque compartan `JWT_SECRET` — un token de cliente nunca pasa por rutas de staff.
- **Endpoints `/staff`**:
  - `POST /staff/login` — login interno (bcrypt + JWT 3d).
  - `POST /staff/registro` — registro de personal con código de invitación `tipo='staff'` (generado en `/admin/codigos-invitacion` con su `rol_staff` incrustado). Inserta en la tabla `staff` con `rol` del código, consume el código atómicamente y devuelve `{ token, staff }` (auto-login). El rol NUNCA sale del body.
  - `GET /staff/despacho`, `PATCH /staff/despacho/:id/entregar` — cola `enviado` → `entregado`.
  - `POST /staff/ordenes` — vendedor crea pedido a nombre de un cliente (usa `construirOrden` con `creado_por_staff_id`).
  - `POST /staff/admin-bridge` — staff admin/director recibe un JWT de CLIENTE válido para entrar al panel `/admin` (empareja por email con cuenta `users` `es_admin=true`).
  - **`/staff/almacen`** (`almacenista/administrador/director/admin`): `GET /revisar` (cola `pedido_creado` con items y stock), `GET /preparar` (cola unificada `procesando`+`preparando`); `PATCH /:id/aprobar` (ajusta cantidades, anula items agotados con nota, recalcula `total_usd`, pasa a `procesando` y bifurca: contado→`estado_pago='esperando'` / crédito→`preparando` con `fecha_vencimiento`); `PATCH /:id/cancelar` (solo `pedido_creado`/`preparando`); `PATCH /:id/enviado` (`preparando→enviado`). Usa `validarTransicion`/`aplicarCambioEstado` + el helper `bifurcarProcesando` de `ordenes.controller.js`. OJO: NO existe `PATCH /:id/preparando` — `procesando→preparando` queda exclusivo de la verificación de pago de contabilidad.
  - **`/staff/contabilidad`** (`contabilidad/administrador/director/admin`): `GET /clientes` (resumen), `GET /clientes/:id` (detalle), `GET /clientes/:id/comparativa`, `GET /clientes/:id/sin-facturar`; `GET|POST /pagos`, `DELETE /pagos/:id`; `GET|POST /facturas`, `PATCH|DELETE /facturas/:id`; `GET /reportes-pago`, `PATCH /reportes-pago/:id/verificar`, `PATCH /reportes-pago/:id/rechazar`. Duplica la lógica de `/admin` (facturas/pagos/estadocuenta/reportes) pero con sesión staff; **`created_by` = `req.staff.id`** (en pagos/facturas/reportes). No toca los controllers de `/admin`.
- Frontend: `src/pages/staff/` (StaffLogin, StaffDashboard, StaffAlmacen, StaffContabilidad, StaffDespacho, StaffOrdenes), `src/components/staff/` (LayoutStaff + NavStaff, sidebar persistente), `src/context/StaffAuthContext.jsx`, `src/api/staffAxios.js` (token propio `staff_token`, sesion independiente de la de cliente), `src/components/PrivateRouteStaff.jsx`.
- **Orden de montaje en `server.js`**: `/staff/almacen` y `/staff/contabilidad` se montan ANTES de `/staff` (llegan antes que el router base).

**Importante**: la tabla `staff` y la columna `ordenes.creado_por_staff_id` NO existen en una BD sin ejecutar la migracion `008_staff.sql`; los roles nuevos (`almacenista`, `contabilidad`, `director`) no funcionan sin `009_roles_staff.sql`. El módulo de aprobación (ajustar cantidades / anular items) no funciona sin `010_ordenes_items_anulado.sql`.

### Pipeline de estados de órdenes (relevante para staff)

`pedido_creado → procesando → preparando → enviado → entregado` (`cancelado` desde cualquier no-terminal). `TRANSICIONES_PERMITIDAS` en `ordenes.controller.js`. Al entrar a `preparando` en órdenes a crédito se calcula `fecha_vencimiento`.

**Aprobación de órdenes (flujo actual)**: toda orden nace en `pedido_creado`. El almacenista la aprueba (`PATCH /staff/almacen/:id/aprobar`) → pasa a `procesando` y `bifurcarProcesando` la separa según tipo de cliente:
- **Crédito** → `preparando` directo (con `fecha_vencimiento`).
- **Contado** → `procesando` con `estado_pago='esperando'`; recién cuando contabilidad verifica el pago (`verificarReportePago`) pasa a `preparando`.

La cola "Por preparar" del almacén (`GET /staff/almacen/preparar`) une ambas vías (`procesando`+`preparando`). La confirmación de pago a contado NO puede saltarse desde el almacén.

### Módulo de aprobación/confirmación de órdenes (IMPLEMENTADO — 2026-09-04)

Se construyó el flujo de aprobación del almacenista. Docs: `analisis/2026-09-04-aprobacion-ordenes-almacenista-design.md` y `analisis/2026-09-04-aprobacion-ordenes-almacenista-plan.md`. Resumen de lo agregado:

- Migración `010_ordenes_items_anulado.sql`: `anulado BOOLEAN` + `nota_anulacion TEXT` en `ordenes_items` (auditoría — el item no se borra, el total excluye anulados).
- `almacen.controller.js`: `getColaRevisar`, `getColaPreparar`, `aprobarOrden` (ajusta cantidades/anula/recalcula total y notifica si hubo cambios), `cancelarOrden`, `marcarEnviado`. Se ELIMINARON `getColaAlmacen` y `marcarPreparando` — no reintroducirlos.
- `ordenes.controller.js`: helper `bifurcarProcesando(orden)`; `updateEstadoOrden` lo usa (ya no bifurca inline).
- `contabilidad.controller.js` + rutas: `GET /staff/contabilidad/ordenes-procesando` (contado esperando pago) y `PATCH /staff/contabilidad/ordenes/:id/cancelar` (tab "Por cobrar" en el frontend).
- Frontend: `StaffAlmacen.jsx` con tabs "Por revisar" / "Por preparar" y `StaffContabilidad.jsx` con tab "Por cobrar".

Ideas pendientes (ver `analisis/plan-modulos-staff-por-rol.md`): proveedores, estadísticas separadas del staff, historial de actividad de aprobación (quién ajustó/anuló qué), y asegurar notificación por item anulado cuando ya hay cambios.

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

Ubicacion: `src/migrations/` (9 archivos)

Las migraciones son SQL plano. NO hay sistema de migraciones automatico — se ejecutan manualmente en Supabase SQL Editor.

| Archivo | Que hace |
|---------|----------|
| 002_notificacion_preferencias.sql | Tabla de preferencias de push por usuario |
| 003_promociones_plantillas.sql | Tablas de plantillas e historial de promociones |
| 004_fix_notificacion_preferencias.sql | Correccion: usuario_id INTEGER en vez de UUID |
| 005_tarifas_delivery.sql | Tabla de costos de delivery por ciudad |
| 006_reinicio_clave.sql | Campo reinicio_clave en users |
| 007_codigos_invitacion_schema.sql | Columnas de expiracion y creacion en codigos_invitacion |
| 008_staff.sql | Tabla `staff` (login interno) + columna `ordenes.creado_por_staff_id` |
| 009_roles_staff.sql | Amplia el CHECK `staff.rol` (DROP CONSTRAINT) para incluir `almacenista`, `contabilidad`, `director` |
| 010_ordenes_items_anulado.sql | Aprobación de órdenes: columnas `anulado` + `nota_anulacion` en `ordenes_items` |
| 011_codigos_invitacion_tipo_staff.sql | Códigos de invitación: columnas `tipo` ('honorifico'\|'staff') + `rol_staff` para códigos de staff |

**IMPORTANTE**: La tabla principal `users` NO esta en estas migraciones — fue creada directamente en Supabase. Si necesitas ver su schema, busca las queries en los controllers (especialmente auth.controller.js y users.controller.js).

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
