import rateLimit from 'express-rate-limit';

// Límite estricto para endpoints de autenticación: login, register y
// check-email son los blancos naturales de fuerza bruta y de enumeración
// de cuentas. 10 intentos cada 15 minutos por IP es suficiente para un
// usuario legítimo que se equivoca de password, pero frena un ataque.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  // No contar los intentos exitosos de login/register, solo los fallidos
  // habría sido ideal, pero requiere lógica adicional en el controller.
  // Por ahora contamos todas las requests a estas rutas.
});

// Límite general para el resto de la API: mucho más permisivo, solo
// para frenar abuso obvio (scraping agresivo, bots, bugs de polling).
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Límite específico para /uploads/registro: es un endpoint público (sin
// JWT, porque el usuario aún no tiene cuenta al subir sus documentos) que
// escribe archivos directo en el Google Drive del negocio. El límite
// general de 300/15min es demasiado alto para esto — alguien podría
// llenar el Drive de basura antes de que corte. Un usuario legítimo
// completando el registro sube como máximo 4 archivos (RIF, permiso
// sanitario, registro mercantil, certificado), así que 15 da margen
// de sobra para reintentos por error sin abrir la puerta a abuso.
export const uploadsRegistroLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Demasiadas subidas de archivos. Intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});