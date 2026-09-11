import { Router } from 'express';
import {
  getProductos,
  getProductosMetadata,
  getProductosStats,
  getProductoById,
  createProducto,
  updateProducto,
  preciosBulkUpdate
} from '../controllers/productos.controller.js';
import { getEstadoAlerta, suscribirseAlerta, cancelarAlerta } from '../controllers/alertasDisponibilidad.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', getProductos);
router.get('/metadata', getProductosMetadata);
router.get('/stats', verifyJWT, verifyAdmin, getProductosStats);
router.get('/:id', getProductoById);
router.post('/', verifyJWT, verifyAdmin, createProducto);
router.post('/precios-bulk', verifyJWT, verifyAdmin, preciosBulkUpdate);
router.patch('/:id', verifyJWT, verifyAdmin, updateProducto);

// "Avísame cuando llegue" — suscripción del cliente a un producto sin precio
router.get('/:id/avisame', verifyJWT, getEstadoAlerta);
router.post('/:id/avisame', verifyJWT, suscribirseAlerta);
router.delete('/:id/avisame', verifyJWT, cancelarAlerta);

export default router;