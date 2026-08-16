import { Router } from 'express';
import {
  createReportePago,
  getReportesPago,
  getReportePagoById,
  verificarReportePago,
  rechazarReportePago
} from '../controllers/reportesPago.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

// Cliente: crear su reporte de pago (una o varias órdenes)
router.post('/', verifyJWT, createReportePago);

// Admin: cola de verificación y acciones — TODAS las rutas específicas
// van antes que '/:id', para que Express no las confunda con un id.
router.get('/', verifyJWT, verifyAdmin, getReportesPago);
router.patch('/:id/verificar', verifyJWT, verifyAdmin, verificarReportePago);
router.patch('/:id/rechazar', verifyJWT, verifyAdmin, rechazarReportePago);

// Cliente o admin: ver un reporte puntual — va AL FINAL porque
// ':id' es un comodín que atraparía cualquier ruta declarada después.
router.get('/:id', verifyJWT, getReportePagoById);

export default router;