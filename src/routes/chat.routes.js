import { Router } from 'express';
import {
  getConversaciones,
  getOrCrearConversacionGeneral,
  getOrCrearConversacionOrden,
  getMensajes,
  crearMensaje,
  getNoLeidos
} from '../controllers/chat.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

router.get('/conversaciones', verifyJWT, getConversaciones);
router.get('/no-leidos', verifyJWT, getNoLeidos);
router.get('/general', verifyJWT, getOrCrearConversacionGeneral);
router.get('/orden/:ordenId', verifyJWT, getOrCrearConversacionOrden);
router.get('/conversaciones/:id/mensajes', verifyJWT, getMensajes);
router.post('/conversaciones/:id/mensajes', verifyJWT, crearMensaje);

export default router;
