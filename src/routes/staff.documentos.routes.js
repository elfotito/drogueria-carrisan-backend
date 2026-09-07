import { Router } from 'express';
import {
  getSolicitudesDocumentos,
  aprobarSolicitudDocumento,
  rechazarSolicitudDocumento,
} from '../controllers/documentos.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_COMERCIAL = ['vendedor', 'administrador', 'director', 'admin'];

router.get('/', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), getSolicitudesDocumentos);
router.patch('/:id/aprobar', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), aprobarSolicitudDocumento);
router.patch('/:id/rechazar', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), rechazarSolicitudDocumento);

export default router;