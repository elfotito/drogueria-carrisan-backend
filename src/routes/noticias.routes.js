import { Router } from 'express';
import { getNoticias } from '../controllers/noticias.controller.js';

const router = Router();

router.get('/', getNoticias);

export default router;