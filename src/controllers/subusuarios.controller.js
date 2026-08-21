import bcrypt from 'bcrypt';
import { supabase } from '../config/supabase.js';

// ---------------------------------------------------------
// Sub-usuarios: identificación por PIN, no cuentas de acceso.
// Pertenecen a la cuenta (usuario_id) que los creó — solo esa
// cuenta puede crear/editar/desactivar los suyos. El PIN nunca
// sale del backend en texto plano ni se devuelve el hash.
// ---------------------------------------------------------

const PIN_REGEX = /^\d{4}$/;

function sinHash(subUsuario) {
  const { pin_hash, ...resto } = subUsuario;
  return resto;
}

// GET /sub-usuarios — lista los de la cuenta autenticada
export async function getSubUsuarios(req, res) {
  try {
    const { data, error } = await supabase
      .from('sub_usuarios')
      .select('id, usuario_id, nombre, activo, created_at')
      .eq('usuario_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al obtener sub-usuarios:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /sub-usuarios  { nombre, pin }
export async function crearSubUsuario(req, res) {
  const { nombre, pin } = req.body;
  const usuario_id = req.user.id;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  if (!PIN_REGEX.test(pin)) {
    return res.status(400).json({ error: 'El PIN debe tener 4 dígitos' });
  }

  try {
    // Unicidad de PIN dentro de la cuenta: comparamos contra los
    // hashes existentes (ver nota en la migración)
    const { data: existentes, error: errorExistentes } = await supabase
      .from('sub_usuarios')
      .select('pin_hash')
      .eq('usuario_id', usuario_id)
      .eq('activo', true);

    if (errorExistentes) throw errorExistentes;

    for (const s of existentes) {
      if (await bcrypt.compare(pin, s.pin_hash)) {
        return res.status(400).json({ error: 'Ese PIN ya está en uso por otro sub-usuario de tu cuenta' });
      }
    }

    const pin_hash = await bcrypt.hash(pin, 10);

    const { data, error } = await supabase
      .from('sub_usuarios')
      .insert({ usuario_id, nombre: nombre.trim(), pin_hash })
      .select('id, usuario_id, nombre, activo, created_at')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear sub-usuario:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /sub-usuarios/:id  { nombre?, activo? }
export async function actualizarSubUsuario(req, res) {
  const { id } = req.params;
  const { nombre, activo } = req.body;

  try {
    const { data: subUsuario, error: errorBusqueda } = await supabase
      .from('sub_usuarios')
      .select('*')
      .eq('id', id)
      .single();

    if (errorBusqueda || !subUsuario) {
      return res.status(404).json({ error: 'Sub-usuario no encontrado' });
    }
    if (subUsuario.usuario_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const cambios = {};
    if (typeof nombre === 'string' && nombre.trim()) cambios.nombre = nombre.trim();
    if (typeof activo === 'boolean') cambios.activo = activo;

    const { data, error } = await supabase
      .from('sub_usuarios')
      .update(cambios)
      .eq('id', id)
      .select('id, usuario_id, nombre, activo, created_at')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al actualizar sub-usuario:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /sub-usuarios/:id
// Borrado real (no soft-delete) porque órdenes.sub_usuario_id se
// queda en null automáticamente al eliminar (FK sin ON DELETE
// CASCADE en ese sentido — revisa que tu migración lo deje así si
// quieres conservar el historial con el nombre; alternativa más
// segura: usar PATCH activo=false en vez de DELETE).
export async function eliminarSubUsuario(req, res) {
  const { id } = req.params;

  try {
    const { data: subUsuario, error: errorBusqueda } = await supabase
      .from('sub_usuarios')
      .select('usuario_id')
      .eq('id', id)
      .single();

    if (errorBusqueda || !subUsuario) {
      return res.status(404).json({ error: 'Sub-usuario no encontrado' });
    }
    if (subUsuario.usuario_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { error } = await supabase.from('sub_usuarios').delete().eq('id', id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('Error al eliminar sub-usuario:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /sub-usuarios/verificar  { pin }
// Usado en el checkout: resuelve el PIN a un sub-usuario de la
// cuenta autenticada. Si la cuenta no tiene sub-usuarios activos,
// el frontend ni siquiera debería llamar esto.
export async function verificarPin(req, res) {
  const { pin } = req.body;
  const usuario_id = req.user.id;

  if (!PIN_REGEX.test(pin)) {
    return res.status(400).json({ error: 'PIN inválido' });
  }

  try {
    const { data: subUsuarios, error } = await supabase
      .from('sub_usuarios')
      .select('id, nombre, pin_hash')
      .eq('usuario_id', usuario_id)
      .eq('activo', true);

    if (error) throw error;

    for (const s of subUsuarios) {
      if (await bcrypt.compare(pin, s.pin_hash)) {
        return res.json({ id: s.id, nombre: s.nombre });
      }
    }

    res.status(404).json({ error: 'PIN incorrecto' });
  } catch (err) {
    console.error('Error al verificar PIN:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
