import express from 'express';
import {
  listarDescuentos,
  historialPorProducto,
  crearDescuento,
  editarDescuento,
  eliminarDescuento,
} from '../controllers/descuentos.controller.js';
import verifyJWT from '../middleware/verifyJWT.js'; // ajusta el nombre real si difiere
import soloAdmin from '../middleware/soloAdmin.middleware.js';

const router = express.Router();

router.get('/', verifyJWT, soloAdmin, listarDescuentos);
router.get('/producto/:id', verifyJWT, soloAdmin, historialPorProducto);
router.post('/', verifyJWT, soloAdmin, crearDescuento);
router.put('/:id', verifyJWT, soloAdmin, editarDescuento);
router.delete('/:id', verifyJWT, soloAdmin, eliminarDescuento);

export default router;
