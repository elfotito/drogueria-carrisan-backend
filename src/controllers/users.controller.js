import bcrypt from 'bcrypt';
import { supabase } from '../config/supabase.js';

// GET /users (admin) - listar todos
export async function getUsers(req, res) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, nombre, etiqueta, es_admin, activo, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /users (admin) - crear usuario
// (Esto es básicamente lo mismo que /auth/register, pero bajo /users para organizarlo mejor)
export async function createUser(req, res) {
  const { email, password, nombre, etiqueta } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos' });
  }

  try {
    const { data: existente } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existente) {
      return res.status(409).json({ error: 'Ese email ya está registrado' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert({ email, password_hash, nombre, etiqueta: etiqueta || 'distribuidor' })
      .select('id, email, nombre, etiqueta, es_admin, activo, created_at')
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /users/:id (admin) - editar
export async function updateUser(req, res) {
  const { id } = req.params;
  const { nombre, etiqueta, activo, password } = req.body;

  try {
    const cambios = {};
    if (nombre !== undefined) cambios.nombre = nombre;
    if (etiqueta !== undefined) cambios.etiqueta = etiqueta;
    if (activo !== undefined) cambios.activo = activo;
    if (password) cambios.password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .update(cambios)
      .eq('id', id)
      .select('id, email, nombre, etiqueta, es_admin, activo, created_at')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /users/:id (admin)
export async function deleteUser(req, res) {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}