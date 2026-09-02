import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

// Verifica el JWT de personal interno (staff). Independiente de verifyJWT
// (clientes) — usa su propia tabla y exige tipo:'staff' en el payload para
// que un token de cliente nunca pase por acá aunque comparta el secreto.
export async function verifyStaffJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No se proporcionó token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.tipo !== 'staff') {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const { data: staff, error } = await supabase
      .from('staff')
      .select('token_version, activo')
      .eq('id', decoded.id)
      .single();

    if (error || !staff) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    if (!staff.activo) {
      return res.status(403).json({ error: 'Cuenta de staff desactivada' });
    }

    if (staff.token_version !== decoded.token_version) {
      return res.status(401).json({ error: 'Sesión revocada, inicia sesión de nuevo' });
    }

    req.staff = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// checkRolStaff(['admin', 'administrador']) — usar siempre después de verifyStaffJWT
export function checkRolStaff(rolesPermitidos) {
  return (req, res, next) => {
    if (!req.staff) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!rolesPermitidos.includes(req.staff.rol)) {
      return res.status(403).json({ error: 'No autorizado para esta acción' });
    }
    next();
  };
}