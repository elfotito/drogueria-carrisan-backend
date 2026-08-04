/**
 * Middleware que exige que el usuario autenticado sea admin.
 * Debe usarse SIEMPRE después de verifyJWT, ya que depende de req.user
 * (o req.usuario, ajusta el nombre según cómo lo dejaste en verifyJWT).
 *
 * Asume que el payload del JWT incluye "es_admin" (boolean), igual que
 * la columna de la tabla users. Si tu verifyJWT solo mete { id, email }
 * en el token y no incluye es_admin, hay que:
 *   a) agregarlo al payload cuando generas el token en el login, o
 *   b) consultarlo aquí mismo a la tabla users con el id del token
 * Te dejo la opción (b) comentada abajo por si el token no lo trae.
 */

export default function soloAdmin(req, res, next) {
  const usuario = req.user || req.usuario // ajusta según cómo verifyJWT lo setea

  if (!usuario) {
    return res.status(401).json({ error: 'No autenticado' })
  }

  if (!usuario.es_admin) {
    return res.status(403).json({ error: 'Acceso solo para administradores' })
  }

  next()
}

// ============================================================
// ALTERNATIVA si el JWT NO trae es_admin en el payload:
// (descomenta esto y comenta el export de arriba)
// ============================================================
//
// import { supabase } from '../config/supabase.js'
//
// export default async function soloAdmin(req, res, next) {
//   const usuario = req.user || req.usuario
//   if (!usuario) return res.status(401).json({ error: 'No autenticado' })
//
//   const { data, error } = await supabase
//     .from('users')
//     .select('es_admin')
//     .eq('id', usuario.id)
//     .single()
//
//   if (error || !data) return res.status(401).json({ error: 'Usuario no encontrado' })
//   if (!data.es_admin) return res.status(403).json({ error: 'Acceso solo para administradores' })
//
//   next()
// }
