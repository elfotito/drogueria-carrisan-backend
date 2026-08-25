import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cron from 'node-cron';
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
import { authLimiter, apiLimiter } from './middleware/Ratelimit.js';
import uploadsRoutes from './routes/Uploads.routes.js';
import pushRoutes from './routes/push.routes.js';
import requerimientosRoutes from './routes/requerimientos.routes.js';
import documentosRoutes from './routes/documentos.routes.js';
import chatRoutes from './routes/chat.routes.js';
import subusuariosRoutes from './routes/subusuarios.routes.js';
import cotizacionesRoutes from './routes/cotizaciones.routes.js';
import { revisarVencimientos } from './jobs/revisarVencimientos.js';
import presupuestosRoutes from './routes/presupuestos.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import valoracionesRoutes from './routes/valoraciones.routes.js';
import imagesRoutes from './routes/images.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

if (!process.env.FRONTEND_URL) {
  console.warn('⚠️  FRONTEND_URL no está definida — usando solo http://localhost:5173. Configúrala en producción.');
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
app.use('/push', pushRoutes);
app.use('/requerimientos', requerimientosRoutes);
app.use('/documentos', documentosRoutes);
app.use('/chat', chatRoutes);
app.use('/subusuarios', subusuariosRoutes);
app.use('/cotizaciones', cotizacionesRoutes);
app.use('/presupuestos', presupuestosRoutes);
app.use('/admin/analytics', analyticsRoutes);
app.use('/products', valoracionesRoutes);
app.use('/images', imagesRoutes);



app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

// -----------------------------------------------------------------
// Job diario de vencimientos: revisa órdenes a crédito vencidas y
// notifica al cliente una sola vez por orden (ver src/jobs/
// revisarVencimientos.js). Corre todos los días a las 8:00am hora
// de Venezuela (America/Caracas, UTC-4, sin cambio de horario).
// -----------------------------------------------------------------
cron.schedule('0 8 * * *', revisarVencimientos, {
  timezone: 'America/Caracas',
});