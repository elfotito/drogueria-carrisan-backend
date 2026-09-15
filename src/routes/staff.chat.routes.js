import { Router } from 'express';
import {
  getConversacionesStaff,
  getMensajesStaff,
  crearMensajeStaff,
} from '../controllers/staff.chat.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_CHAT = ['vendedor', 'administrador', 'director', 'admin'];

router.get('/conversaciones', verifyStaffJWT, checkRolStaff(ROLES_CHAT), getConversacionesStaff);
router.get('/conversaciones/:id/mensajes', verifyStaffJWT, checkRolStaff(ROLES_CHAT), getMensajesStaff);
router.post('/conversaciones/:id/mensajes', verifyStaffJWT, checkRolStaff(ROLES_CHAT), crearMensajeStaff);

export default router;