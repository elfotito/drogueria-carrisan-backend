import { Router } from 'express';
import multer from 'multer';
import {
  getPreciosStaff,
  actualizarPrecioStaff,
  actualizarPreciosLoteStaff,
  importarPreciosProveedor,
} from '../controllers/staff.precios.controller.js';
import { verifyStaffJWT, checkRolStaff } from '../middleware/staffAuth.js';

const router = Router();

const ROLES_COMERCIAL = ['vendedor', 'administrador', 'director', 'admin'];

// Multer memoryStorage: el archivo del proveedor se procesa en memoria (no se guarda).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), getPreciosStaff);
router.post('/importar-proveedor', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), upload.single('archivo'), importarPreciosProveedor);
router.patch('/lote', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), actualizarPreciosLoteStaff);
router.patch('/:id', verifyStaffJWT, checkRolStaff(ROLES_COMERCIAL), actualizarPrecioStaff);

export default router;
