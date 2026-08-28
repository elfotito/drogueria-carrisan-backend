import { Router } from 'express';
import { checkEmail, login, register, verify, verificarCodigo, resetPassword } from '../controllers/auth.controller.js';
import { verifyJWT } from '../middleware/auth.js';
import { resetPasswordLimiter } from '../middleware/Ratelimit.js';

const router = Router();

router.post('/check-email', checkEmail);
router.post('/verificar-codigo', verificarCodigo);
router.post('/login', login);
router.post('/register', register);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
router.get('/verify', verifyJWT, verify);

export default router;