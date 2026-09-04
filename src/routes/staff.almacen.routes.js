import { Router } from 'express';
import {
  getColaAlmacen,
  marcarPreparando,
  marcarEnviado,
} from '../controllers/almacen.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

// Almacenista maneja la preparación: despachador/admin/director también pueden.
const ROLES_ALMACEN = ['almacenista', 'administrador', 'director', 'admin'];

router.get('/', verifyStaffJWT, checkRolStaff(ROLES_ALMACEN), getColaAlmacen);
router.patch('/:id/preparando', verifyStaffJWT, checkRolStaff(ROLES_ALMACEN), marcarPreparando);
router.patch('/:id/enviado', verifyStaffJWT, checkRolStaff(ROLES_ALMACEN), marcarEnviado);

export default router;
