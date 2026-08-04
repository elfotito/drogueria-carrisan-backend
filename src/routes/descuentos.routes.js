import express from 'express';
import {
  listarDescuentos,
  historialPorProducto,
  crearDescuento,
  editarDescuento,
  eliminarDescuento,
} from '../controllers/descuentos.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', verifyJWT, verifyAdmin, listarDescuentos);
router.get('/producto/:id', verifyJWT, verifyAdmin, historialPorProducto);
router.post('/', verifyJWT, verifyAdmin, crearDescuento);
router.put('/:id', verifyJWT, verifyAdmin, editarDescuento);
router.delete('/:id', verifyJWT, verifyAdmin, eliminarDescuento);

export default router;
