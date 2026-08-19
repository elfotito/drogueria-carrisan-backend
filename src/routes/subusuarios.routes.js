import { Router } from 'express';
import {
  getSubUsuarios,
  crearSubUsuario,
  actualizarSubUsuario,
  eliminarSubUsuario,
  verificarPin
} from '../controllers/subusuarios.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

router.get('/', verifyJWT, getSubUsuarios);
router.post('/', verifyJWT, crearSubUsuario);
router.post('/verificar', verifyJWT, verificarPin);
router.patch('/:id', verifyJWT, actualizarSubUsuario);
router.delete('/:id', verifyJWT, eliminarSubUsuario);

export default router;
