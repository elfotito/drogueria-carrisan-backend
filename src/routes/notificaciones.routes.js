import { Router } from 'express';
import {
  getNotificaciones,
  getUnreadCount,
  marcarLeida,
  marcarTodasLeidas,
  getPreferencias,
  actualizarPreferencias,
  cleanupNotificaciones,
} from '../controllers/notificaciones.controller.js';
import { verifyJWT } from '../middleware/auth.js';
import soloAdmin from '../middleware/soloAdmin.middleware.js';

const router = Router();

router.get('/preferences', verifyJWT, getPreferencias);
router.put('/preferences', verifyJWT, actualizarPreferencias);
router.get('/', verifyJWT, getNotificaciones);
router.get('/unread-count', verifyJWT, getUnreadCount);
router.patch('/read-all', verifyJWT, marcarTodasLeidas);
router.patch('/:id', verifyJWT, marcarLeida);
router.delete('/cleanup', verifyJWT, soloAdmin, cleanupNotificaciones);

export default router;