import express from 'express';
import {
  getCatalogo,
  getCatalogoMetadata,
  getProductoCatalogo
} from '../controllers/catalogo.controller.js';

const router = express.Router();

// Catálogo público de consulta (sin auth). El apiLimiter global de server.js ya lo cubre.
router.get('/', getCatalogo);
router.get('/metadata', getCatalogoMetadata);
router.get('/:sku', getProductoCatalogo);

export default router;