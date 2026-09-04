import { Router } from 'express';
import {
  getResumenClientes,
  getEstadoCuentaCliente,
  getComparativaMensual,
  getPagos,
  createPago,
  deletePago,
  getFacturas,
  createFactura,
  updateFactura,
  deleteFactura,
  getOrdenesSinFacturar,
  getReportesPago,
  verificarReportePago,
  rechazarReportePago,
} from '../controllers/contabilidad.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_CONTABILIDAD = ['contabilidad', 'administrador', 'director', 'admin'];

// Estado de cuenta
router.get('/clientes', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), getResumenClientes);
router.get('/clientes/:id', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), getEstadoCuentaCliente);
router.get('/clientes/:id/comparativa', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), getComparativaMensual);
router.get('/clientes/:id/sin-facturar', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), getOrdenesSinFacturar);

// Pagos
router.get('/pagos', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), getPagos);
router.post('/pagos', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), createPago);
router.delete('/pagos/:id', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), deletePago);

// Facturas
router.get('/facturas', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), getFacturas);
router.post('/facturas', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), createFactura);
router.patch('/facturas/:id', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), updateFactura);
router.delete('/facturas/:id', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), deleteFactura);

// Reportes de pago (cola de verificación)
router.get('/reportes-pago', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), getReportesPago);
router.patch('/reportes-pago/:id/verificar', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), verificarReportePago);
router.patch('/reportes-pago/:id/rechazar', verifyStaffJWT, checkRolStaff(ROLES_CONTABILIDAD), rechazarReportePago);

export default router;
