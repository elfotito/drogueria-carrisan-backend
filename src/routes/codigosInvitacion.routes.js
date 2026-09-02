import { Router } from 'express';
import { generarCodigo, listarCodigos, eliminarCodigo, getEstadisticas } from '../controllers/codigosInvitacion.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

// Todas estas rutas son solo para admin
router.use(verifyJWT, verifyAdmin);

router.get('/', listarCodigos);
router.post('/', generarCodigo);
router.delete('/:id', eliminarCodigo);
router.get('/estadisticas', getEstadisticas);

export default router;
