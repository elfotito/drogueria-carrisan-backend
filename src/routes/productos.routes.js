import { Router } from 'express';
import {
  getProductos,
  getProductoById,
  createProducto,
  updateProducto
} from '../controllers/productos.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';
import {
  getEstadoAlerta,
  suscribirseAlerta,
  cancelarAlerta,
} from '../controllers/alertasDisponibilidad.controller.js';



const router = Router();

router.get('/', getProductos);
router.get('/:id', getProductoById);
router.post('/', verifyJWT, verifyAdmin, createProducto);
router.patch('/:id', verifyJWT, verifyAdmin, updateProducto);
router.get('/:id/avisame', verifyJWT, getEstadoAlerta);
router.post('/:id/avisame', verifyJWT, suscribirseAlerta);
router.delete('/:id/avisame', verifyJWT, cancelarAlerta);

export default router;