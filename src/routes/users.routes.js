import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser, solicitarReinicio } from '../controllers/users.controller.js';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js';

const router = Router();

// Todas estas rutas son solo para admin
router.use(verifyJWT, verifyAdmin);

router.get('/', getUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.post('/:id/solicitar-reinicio', solicitarReinicio);
router.delete('/:id', deleteUser);

export default router;