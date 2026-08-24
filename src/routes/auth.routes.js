import { Router } from 'express';
import { checkEmail, login, register, verify, verificarCodigo } from '../controllers/auth.controller.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

router.post('/check-email', checkEmail);
router.post('/verificar-codigo', verificarCodigo);
router.post('/login', login);
router.post('/register', register);
router.get('/verify', verifyJWT, verify);

export default router;