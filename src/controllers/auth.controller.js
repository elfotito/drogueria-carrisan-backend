import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

// POST /auth/login
export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos' });
  }

  try {
    // 1. Buscar el usuario por email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!user.activo) {
      return res.status(403).json({ error: 'Usuario desactivado' });
    }

    // 2. Comparar el password que mandaron con el hash guardado
    const passwordValido = await bcrypt.compare(password, user.password_hash);

    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // 3. Generar el token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, es_admin: user.es_admin },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 4. Devolver token + datos del usuario (sin el password_hash)
    const { password_hash, ...userSinPassword } = user;

    res.json({ token, user: userSinPassword });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /auth/register (solo admin crea usuarios)
export async function register(req, res) {
  const { email, password, nombre, etiqueta, es_admin } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos' });
  }

  try {
    // 1. Verificar que el email no exista ya
    const { data: existente } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existente) {
      return res.status(409).json({ error: 'Ese email ya está registrado' });
    }

    // 2. Hashear el password (nunca guardamos texto plano)
    const password_hash = await bcrypt.hash(password, 10);

    // 3. Insertar el nuevo usuario
    const { data: nuevoUsuario, error } = await supabase
      .from('users')
      .insert({
        email,
        password_hash,
        nombre: nombre || null,
        etiqueta: etiqueta || 'distribuidor',
        es_admin: es_admin || false
      })
      .select()
      .single();

    if (error) throw error;

    const { password_hash: _, ...userSinPassword } = nuevoUsuario;
    res.status(201).json({ user: userSinPassword });
  } catch (err) {
    console.error('Error en register:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /auth/verify
export async function verify(req, res) {
  // Si llegó hasta acá, el middleware verifyJWT ya validó el token
  res.json({ valid: true, user: req.user });
}

// POST /auth/check-email
// Paso 1 del login por pasos: solo confirma si el correo existe, sin dar
// pistas de más (no decimos si está activo o no acá, eso lo maneja login()
// normalmente en el paso 2).
export async function checkEmail(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email es requerido' });
  }

  try {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    res.json({ existe: !!data });
  } catch (err) {
    console.error('Error en checkEmail:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /auth/reset-password
// Reseteo simple sin email: en vez de un link temporal, usamos rif_cedula
// como una segunda prueba de identidad que solo el dueño de la cuenta conoce.
// Importante: el mensaje de error es genérico a propósito, para no revelar
// si el email existe o si fue el rif_cedula el que no coincidió.
export async function resetPassword(req, res) {
  const { email, rif_cedula, password } = req.body;

  if (!email || !rif_cedula || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, rif_cedula')
      .eq('email', email)
      .single();

    // Comparación case-insensitive y sin espacios de más, por si el usuario
    // tipeó el RIF con formato distinto (ej. mayúsculas/minúsculas, espacios)
    const coincide =
      user &&
      user.rif_cedula &&
      user.rif_cedula.trim().toLowerCase() === rif_cedula.trim().toLowerCase();

    if (error || !user || !coincide) {
      return res.status(401).json({ error: 'Los datos no coinciden' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { error: errorUpdate } = await supabase
      .from('users')
      .update({ password_hash })
      .eq('id', user.id);

    if (errorUpdate) throw errorUpdate;

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error en resetPassword:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}