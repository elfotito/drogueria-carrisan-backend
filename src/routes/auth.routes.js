import { Router } from 'express';
import { login, register, verify } from '../controllers/auth.controller.js';
import { verifyJWT } from '../middleware/auth.js';
import {checkEmail, resetPassword } from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/verify', verifyJWT, verify);
router.post('/check-email', checkEmail);
router.post('/reset-password', resetPassword);

export default router;