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
├── migrations/                # SQL de migraciones (6 archivos)
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

Login aparte para trabajadores de la empresa (vendedores, despachadores, administradores), separado del login de clientes (`/auth`).

- Rutas bajo `/staff`, archivos: `routes/staff.routes.js`, `controllers/staff.controller.js`, `middleware/staffAuth.js`.
- Tabla propia `staff` (no `users`), con `rol` en (`vendedor`, `despachador`, `administrador`, `admin`) y su propio `token_version` (ver migracion `008_staff.sql`).
- El JWT de staff lleva `tipo: 'staff'` + `rol`; el de cliente lleva `es_admin`. `verifyStaffJWT` rechaza cualquier token sin `tipo === 'staff'` aunque compartan `JWT_SECRET` — un token de cliente nunca pasa por rutas de staff.
- Middlewares: `verifyStaffJWT` (valida token e `token_version`) y `checkRolStaff([...])` (RBAC por rol).
- Endpoints:
  - `POST /staff/login` — login interno (bcrypt + JWT 3d).
  - `GET /staff/despacho` — cola de ordenes en estado `enviado` (solo despachador/admin).
  - `PATCH /staff/despacho/:id/entregar` → `enviado → entregado` via `aplicarCambioEstado`/`validarTransicion`.
  - `POST /staff/ordenes` — vendedor crea pedido a nombre de un cliente ya registrado, usando `construirOrden` con `creado_por_staff_id` para trazabilidad.
  - `POST /staff/admin-bridge` — staff admin recibe un JWT de CLIENTE valido (mismo formato que `/auth/login`) para entrar al panel `/admin`. Empareja por email: la cuenta `users` con ese correo debe existir y tener `es_admin=true`.
- Frontend: `src/pages/staff/` (StaffLogin, StaffDashboard, StaffDespacho, StaffOrdenes), `src/context/StaffAuthContext.jsx`, `src/api/staffAxios.js` (token propio `staff_token`, sesion independiente de la de cliente), `src/components/PrivateRouteStaff.jsx`.

**Importante**: la tabla `staff` y la columna `ordenes.creado_por_staff_id` NO existen en una BD sin ejecutar la migracion `008_staff.sql`.

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

Ubicacion: `src/migrations/` (7 archivos)

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
