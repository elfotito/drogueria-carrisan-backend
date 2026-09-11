// staff.reportes.routes.js
import { Router } from 'express';
import { getResumen } from '../controllers/reportes.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_REPORTES = ['contabilidad', 'administrador', 'director', 'admin'];

// Resumen consolidado del período (6 bloques: ventas, crédito, cobros, facturación, egresos)
router.get('/resumen', verifyStaffJWT, checkRolStaff(ROLES_REPORTES), getResumen);

export default router;