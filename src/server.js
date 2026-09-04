import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes.js';
import marcasRoutes from './routes/marcas.routes.js';
import productosRoutes from './routes/productos.routes.js';
import preciosRoutes from './routes/precios.routes.js';
import ordenesRoutes from './routes/ordenes.routes.js';
import usersRoutes from './routes/users.routes.js';
import descuentosRoutes from './routes/descuentos.routes.js';
import facturasRoutes from './routes/facturas.routes.js';
import pagosRoutes from './routes/pagos.routes.js';
import reportesPagoRoutes from './routes/reportesPago.routes.js';
import estadocuentaRoutes from './routes/estadocuenta.routes.js';
import notificacionesRoutes from './routes/notificaciones.routes.js';
import listasRoutes from './routes/listas.routes.js';
import direccionesRoutes from './routes/direcciones.routes.js';
import favoritosRoutes from './routes/favoritos.routes.js';
import moleculasRoutes from './routes/moleculas.routes.js';
import codigosInvitacionRoutes from './routes/codigosInvitacion.routes.js';
import tarifasDeliveryRoutes from './routes/tarifasDelivery.routes.js';
import requerimientosRoutes from './routes/requerimientos.routes.js';
import cotizacionesRoutes from './routes/cotizaciones.routes.js';
import documentosRoutes from './routes/documentos.routes.js';
import chatRoutes from './routes/chat.routes.js';
import presupuestosRoutes from './routes/presupuestos.routes.js';
import subusuariosRoutes from './routes/subusuarios.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import pushRoutes from './routes/push.routes.js';
import promocionesRoutes from './routes/promociones.routes.js';
import valoracionesRoutes from './routes/valoraciones.routes.js';
import { authLimiter, apiLimiter } from './middleware/Ratelimit.js';
import uploadsRoutes from './routes/Uploads.routes.js';
import staffRoutes from './routes/staff.routes.js';
import staffAlmacenRoutes from './routes/staff.almacen.routes.js';
import staffContabilidadRoutes from './routes/staff.contabilidad.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

if (!process.env.FRONTEND_URL) {
  console.warn('⚠️ FRONTEND_URL no está definida — usando solo http://localhost:5173. Configúrala en producción.');
}

app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

// Rate limiting: estricto en auth, general en el resto de la API.
app.use('/auth', authLimiter);
app.use(apiLimiter);

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.use('/auth', authRoutes);
app.use('/marcas', marcasRoutes);
app.use('/products', productosRoutes);
app.use('/prices', preciosRoutes);
app.use('/orders', ordenesRoutes);
app.use('/users', usersRoutes);
app.use('/admin/codigos-invitacion', codigosInvitacionRoutes);
app.use('/descuentos', descuentosRoutes);
app.use('/facturas', facturasRoutes);
app.use('/pagos', pagosRoutes);
app.use('/reportes-pago', reportesPagoRoutes);
app.use('/clientes', estadocuentaRoutes);
app.use('/notifications', notificacionesRoutes);
app.use('/lists', listasRoutes);
app.use('/direcciones', direccionesRoutes);
app.use('/favoritos', favoritosRoutes);
app.use('/uploads', uploadsRoutes);
app.use('/moleculas', moleculasRoutes);
app.use('/staff/login', authLimiter);
app.use('/staff/registro', authLimiter);
app.use('/staff/almacen', staffAlmacenRoutes);
app.use('/staff/contabilidad', staffContabilidadRoutes);
app.use('/staff', staffRoutes);
app.use('/delivery-tarifas', tarifasDeliveryRoutes);
app.use('/requerimientos', requerimientosRoutes);
app.use('/cotizaciones', cotizacionesRoutes);
app.use('/documentos', documentosRoutes);
app.use('/chat', chatRoutes);
app.use('/presupuestos', presupuestosRoutes);
app.use('/subusuarios', subusuariosRoutes);
app.use('/admin/analytics', analyticsRoutes);
app.use('/push', pushRoutes);
app.use('/promociones', promocionesRoutes);
app.use('/products', valoracionesRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
