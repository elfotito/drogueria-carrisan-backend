import jwt from 'jsonwebtoken';

export function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No se proporcionó token' });
  }

  const token = authHeader.split(' ')[1]; // "Bearer eyJhbGci..." → nos quedamos con el token

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // guardamos { id, email, es_admin } dentro del request
    next(); // dejamos pasar a la siguiente función (el controller)
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function verifyAdmin(req, res, next) {
  if (!req.user || !req.user.es_admin) {
    return res.status(403).json({ error: 'Acceso solo para administradores' });
  }
  next();
}