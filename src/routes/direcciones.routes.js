// backend/src/routes/direcciones.routes.js
import { Router } from 'express';
import { getDirecciones, createDireccion, updateDireccion, deleteDireccion } from '../controllers/direcciones.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(verifyJWT);

router.get('/', getDirecciones);
router.post('/', createDireccion);
router.put('/:id', updateDireccion);
router.delete('/:id', deleteDireccion);

export default router;
