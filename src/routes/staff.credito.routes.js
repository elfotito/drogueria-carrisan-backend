import { Router } from 'express';
import {
  getAgingReport,
  getClienteCredito,
  getLineaClientes,
  setLineaCredito,
  getNotasCobranza,
  createNotaCobranza,
  sendRecordatorio,
  toggleBloqueoCredito,
} from '../controllers/credito.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_CREDITO = ['contabilidad', 'administrador', 'director', 'admin'];

// Aging report (dashboard)
router.get('/aging', verifyStaffJWT, checkRolStaff(ROLES_CREDITO), getAgingReport);

// Línea de crédito (listado de todos los clientes + ajuste manual)
router.get('/linea/clientes', verifyStaffJWT, checkRolStaff(ROLES_CREDITO), getLineaClientes);
router.patch('/linea/clientes/:id', verifyStaffJWT, checkRolStaff(ROLES_CREDITO), setLineaCredito);

// Cliente detalle
router.get('/clientes/:id', verifyStaffJWT, checkRolStaff(ROLES_CREDITO), getClienteCredito);

// Notas de cobranza
router.get('/notas', verifyStaffJWT, checkRolStaff(ROLES_CREDITO), getNotasCobranza);
router.post('/notas', verifyStaffJWT, checkRolStaff(ROLES_CREDITO), createNotaCobranza);

// Recordatorio manual (push)
router.post('/recordatorio', verifyStaffJWT, checkRolStaff(ROLES_CREDITO), sendRecordatorio);

// Bloqueo / desbloqueo de crédito
router.patch('/bloquear/:id', verifyStaffJWT, checkRolStaff(ROLES_CREDITO), toggleBloqueoCredito);

export default router;