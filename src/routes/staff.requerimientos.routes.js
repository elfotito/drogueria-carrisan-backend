import { Router } from 'express';
import {
  getRequerimientos,
  responderRequerimiento,
} from '../controllers/requerimientos.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_COMERCIAL = ['vendedor', 'administrador', 'director', 'admin'];

router.get('/', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), getRequerimientos);
router.patch('/:id/responder', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), responderRequerimiento);

export default router;