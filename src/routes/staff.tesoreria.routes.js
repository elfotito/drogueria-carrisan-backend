// staff.tesoreria.routes.js
import { Router } from 'express';
import {
  getMovimientos,
  getResumen,
  crearEgreso,
  eliminarEgreso,
} from '../controllers/tesoreria.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_TESORERIA = ['contabilidad', 'administrador', 'director', 'admin'];

// Movimientos (ingresos derivados de pagos + egresos de tabla)
router.get('/movimientos', verifyStaffJWT, checkRolStaff(ROLES_TESORERIA), getMovimientos);

// Resumen consolidado del período
router.get('/resumen', verifyStaffJWT, checkRolStaff(ROLES_TESORERIA), getResumen);

// Egresos manuales
router.post('/egresos', verifyStaffJWT, checkRolStaff(ROLES_TESORERIA), crearEgreso);
router.delete('/egresos/:id', verifyStaffJWT, checkRolStaff(ROLES_TESORERIA), eliminarEgreso);

export default router;