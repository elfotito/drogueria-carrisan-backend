import { Router } from 'express';
import {
  getProductos,
  getProductosMetadata,
  getProductoById,
  createProducto,
  updateProducto
} from '../controllers/productos.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', getProductos);
router.get('/metadata', getProductosMetadata);
router.get('/:id', getProductoById);
router.post('/', verifyJWT, verifyAdmin, createProducto);
router.patch('/:id', verifyJWT, verifyAdmin, updateProducto);

export default router;