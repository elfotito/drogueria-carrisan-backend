import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.js';
import { 
  obtenerFavoritos, 
  toggleFavorito, 
  eliminarFavorito,
  checkFavorito 
} from '../controllers/favoritos.controller.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(verifyJWT);

router.get('/', obtenerFavoritos);
router.post('/toggle', toggleFavorito);
router.delete('/:productoId', eliminarFavorito);
router.get('/check/:productoId', checkFavorito);

export default router;