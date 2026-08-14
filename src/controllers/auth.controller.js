import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

export async function checkEmail(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email es requerido' });
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .single();

    res.json({ existe: !!user });
  } catch (err) {
    console.error('Error en checkEmail:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

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
      { id: user.id, email: user.email, es_admin: user.es_admin, nombre: user.nombre },
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

// POST /auth/register
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