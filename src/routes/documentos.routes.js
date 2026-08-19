import { Router } from 'express';
import {
  crearSolicitudDocumento,
  getMisDocumentos,
  getSolicitudesDocumentos,
  aprobarSolicitudDocumento,
  rechazarSolicitudDocumento,
} from '../controllers/documentos.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/', verifyJWT, crearSolicitudDocumento);
router.get('/mios', verifyJWT, getMisDocumentos);
router.get('/', verifyJWT, verifyAdmin, getSolicitudesDocumentos);
router.patch('/:id/aprobar', verifyJWT, verifyAdmin, aprobarSolicitudDocumento);
router.patch('/:id/rechazar', verifyJWT, verifyAdmin, rechazarSolicitudDocumento);

export default router;