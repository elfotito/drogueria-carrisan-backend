import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

export async function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No se proporcionó token' });
  }

  const token = authHeader.split(' ')[1]; // "Bearer eyJhbGci..." → nos quedamos con el token

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { data: user, error } = await supabase
      .from('users')
      .select('token_version, activo')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    if (!user.activo) {
      return res.status(403).json({ error: 'Usuario desactivado' });
    }

    if (user.token_version !== decoded.token_version) {
      return res.status(401).json({ error: 'Sesión revocada, inicia sesión de nuevo' });
    }

    req.user = decoded; 
    next();
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