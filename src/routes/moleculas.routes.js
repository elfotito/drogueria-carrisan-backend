import express from 'express';
import { verifyJWT, verifyAdmin } from '../middleware/auth.js'; // ajusta el path si el tuyo es distinto
import {
  getAtcClasificaciones, getAtcClasificacionById, createAtcClasificacion,
  updateAtcClasificacion, deleteAtcClasificacion,
  getMoleculas, getMoleculaById, createMolecula, updateMolecula, deleteMolecula,
  getMoleculasDeProducto, addMoleculaAProducto, updateProductoMolecula, removeMoleculaDeProducto,
  getDetallesProducto, createDetallesProducto, updateDetallesProducto, deleteDetallesProducto,
  getProductoCompleto
} from '../controllers/moleculas.controller.js';

const router = express.Router();

// -------------------- Público --------------------
router.get('/atc-clasificaciones', getAtcClasificaciones);
router.get('/atc-clasificaciones/:id', getAtcClasificacionById);

router.get('/moleculas', getMoleculas);
router.get('/moleculas/:id', getMoleculaById);

router.get('/productos/:producto_id/moleculas', getMoleculasDeProducto);
router.get('/productos/:producto_id/detalles', getDetallesProducto);

// endpoint combinado para ProductoDetalle.jsx
router.get('/products/:id/completo', getProductoCompleto);

// -------------------- Admin --------------------
router.post('/atc-clasificaciones', verifyJWT, verifyAdmin, createAtcClasificacion);
router.patch('/atc-clasificaciones/:id', verifyJWT, verifyAdmin, updateAtcClasificacion);
router.delete('/atc-clasificaciones/:id', verifyJWT, verifyAdmin, deleteAtcClasificacion);

router.post('/moleculas', verifyJWT, verifyAdmin, createMolecula);
router.patch('/moleculas/:id', verifyJWT, verifyAdmin, updateMolecula);
router.delete('/moleculas/:id', verifyJWT, verifyAdmin, deleteMolecula);

router.post('/productos/:producto_id/moleculas', verifyJWT, verifyAdmin, addMoleculaAProducto);
router.patch('/producto-moleculas/:id', verifyJWT, verifyAdmin, updateProductoMolecula);
router.delete('/producto-moleculas/:id', verifyJWT, verifyAdmin, removeMoleculaDeProducto);

router.post('/productos/:producto_id/detalles', verifyJWT, verifyAdmin, createDetallesProducto);
router.patch('/productos/:producto_id/detalles', verifyJWT, verifyAdmin, updateDetallesProducto);
router.delete('/productos/:producto_id/detalles', verifyJWT, verifyAdmin, deleteDetallesProducto);

export default router;
