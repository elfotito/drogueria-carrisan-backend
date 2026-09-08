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
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', getProductos);
router.get('/metadata', getProductosMetadata);
router.get('/stats', verifyJWT, verifyAdmin, getProductosStats);
router.get('/:id', getProductoById);
router.post('/', verifyJWT, verifyAdmin, createProducto);
router.post('/precios-bulk', verifyJWT, verifyAdmin, preciosBulkUpdate);
router.patch('/:id', verifyJWT, verifyAdmin, updateProducto);

export default router;