import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';
import { verificarTurnstile } from '../utils/turnstile.js';
import { validarTransicion, aplicarCambioEstado, construirOrden, ErrorOrden } from './ordenes.controller.js';

// POST /staff/login
export async function loginStaff(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos' });
  }

  try {
    const { data: staff, error } = await supabase
      .from('staff')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (error || !staff) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!staff.activo) {
      return res.status(403).json({ error: 'Cuenta desactivada' });
    }

    const passwordValido = await bcrypt.compare(password, staff.password_hash);
    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      {
        id: staff.id,
        email: staff.email,
        nombre: staff.nombre,
        rol: staff.rol,
        tipo: 'staff',
        token_version: staff.token_version ?? 0
      },
      process.env.JWT_SECRET,
      { expiresIn: '3d' }
    );

    const { password_hash, ...staffSinHash } = staff;
    res.json({ token, staff: staffSinHash });
  } catch (err) {
    console.error('Error en loginStaff:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /staff/registro — registro de personal interno mediante código de
// invitación de tipo 'staff' (generado en /admin/codigos-invitacion con su
// rol incrustado). Inserta en la tabla `staff` (no users), consume el
// código de forma atómica y devuelve token + staff (auto-login).
export async function registrarStaff(req, res) {
  const { email, password, nombre, codigo, turnstileToken } = req.body;

  if (!email || !password || !nombre || !codigo) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  // Misma política que /auth/register: mínimo 8 caracteres + 1 letra + 1 número.
  const tieneLetra = /[a-zA-Z]/.test(password);
  const tieneNumero = /\d/.test(password);
  if (password.length < 8 || !tieneLetra || !tieneNumero) {
    return res.status(400).json({
      error: 'La contraseña debe tener al menos 8 caracteres, incluyendo letras y números'
    });
  }

  const verificacionBot = await verificarTurnstile(turnstileToken, req.ip);
  if (!verificacionBot.valido) {
    return res.status(400).json({ error: verificacionBot.error });
  }

  try {
    const emailNormalizado = email.trim().toLowerCase();
    const codigoNormalizado = codigo.trim().toUpperCase();

    // 1. Buscar el código: debe existir, ser tipo 'staff' y llevar rol.
    const { data: codigoData, error: codigoError } = await supabase
      .from('codigos_invitacion')
      .select('id, usado, expira_en, tipo, rol_staff')
      .eq('codigo', codigoNormalizado)
      .single();

    if (codigoError || !codigoData || codigoData.tipo !== 'staff' || !codigoData.rol_staff) {
      return res.status(404).json({ error: 'Código de invitación no válido' });
    }
    if (codigoData.usado) {
      return res.status(409).json({ error: 'Ese código de invitación ya fue utilizado' });
    }
    if (codigoData.expira_en && new Date(codigoData.expira_en) < new Date()) {
      await supabase.from('codigos_invitacion').delete().eq('id', codigoData.id);
      return res.status(410).json({ error: 'Ese código de invitación expiró' });
    }

    // 2. El email no debe existir ya en la tabla staff.
    const { data: existente } = await supabase
      .from('staff')
      .select('id')
      .eq('email', emailNormalizado)
      .single();

    if (existente) {
      return res.status(409).json({ error: 'Ese email ya está registrado' });
    }

    // 3. Consumir el código de forma atómica (UPDATE ... WHERE usado=false)
    // para evitar que dos registros concurrentes lo usen.
    const { data: consumido, error: consumoError } = await supabase
      .from('codigos_invitacion')
      .update({ usado: true })
      .eq('id', codigoData.id)
      .eq('usado', false)
      .select('id')
      .maybeSingle();

    if (consumoError) throw consumoError;
    if (!consumido) {
      return res.status(409).json({ error: 'Ese código de invitación ya fue utilizado' });
    }

    // 4. Crear el staff. El rol sale del código (lo fijó el admin), nunca
    // del body — impediría auto-asignarse un rol elevado.
    const password_hash = await bcrypt.hash(password, 10);
    const { data: nuevoStaff, error: errorStaff } = await supabase
      .from('staff')
      .insert({
        email: emailNormalizado,
        nombre: nombre.trim(),
        password_hash,
        rol: codigoData.rol_staff,
        activo: true,
        token_version: 0
      })
      .select()
      .single();

    if (errorStaff) {
      // Si el insert falla, revertir el consumo del código para no quemarlo.
      await supabase.from('codigos_invitacion').update({ usado: false }).eq('id', codigoData.id);
      throw errorStaff;
    }

    // 5. Asociar el código consumido al staff creado.
    await supabase
      .from('codigos_invitacion')
      .update({ fecha_uso: new Date().toISOString() })
      .eq('id', codigoData.id);

    // 6. Auto-login: mismo JWT que loginStaff.
    const token = jwt.sign(
      {
        id: nuevoStaff.id,
        email: nuevoStaff.email,
        nombre: nuevoStaff.nombre,
        rol: nuevoStaff.rol,
        tipo: 'staff',
        token_version: nuevoStaff.token_version ?? 0
      },
      process.env.JWT_SECRET,
      { expiresIn: '3d' }
    );

    const { password_hash: _ph, ...staffSinHash } = nuevoStaff;
    res.status(201).json({ token, staff: staffSinHash });
  } catch (err) {
    console.error('Error en registrarStaff:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Ese email ya está registrado' });
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /staff/despacho — cola de órdenes en estado 'enviado', las más
// antiguas primero (orden de despacho, no de creación reciente).
export async function getColaDespacho(req, res) {
  try {
    const { data, error } = await supabase
      .from('ordenes')
      .select('*, users(id, nombre, email, telefono), direcciones_envio(direccion, ciudad, estado), ordenes_items(*, productos(nombre_comercial))')
      .eq('estado', 'enviado')
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json((data || []).map(o => ({
      ...o,
      ordenes_items: Array.isArray(o.ordenes_items) ? o.ordenes_items : []
    })));
  } catch (err) {
    console.error('Error al obtener cola de despacho:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /staff/clientes?buscar=texto — búsqueda de clientes para que el
// vendedor elija a nombre de quién crea el pedido. Devuelve solo lo
// necesario para elegir (no todo el perfil del cliente).
export async function buscarClientes(req, res) {
  const { buscar } = req.query;

  if (!buscar || buscar.trim().length < 2) {
    return res.json([]);
  }

  try {
    const texto = buscar.trim();
    const { data, error } = await supabase
      .from('users')
      .select('id, nombre, email, telefono, rif_cedula, activo')
      .or(`nombre.ilike.%${texto}%,email.ilike.%${texto}%,rif_cedula.ilike.%${texto}%`)
      .eq('activo', true)
      .limit(20);

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error('Error al buscar clientes:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /staff/clientes/:id/direcciones — direcciones activas de un cliente
// puntual (getDirecciones normal solo devuelve las del usuario logueado,
// acá el vendedor necesita las de OTRO usuario).
export async function getDireccionesDeCliente(req, res) {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('direcciones_envio')
      .select('*')
      .eq('usuario_id', id)
      .eq('activo', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error('Error al obtener direcciones del cliente:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /staff/ordenes — un vendedor crea un pedido a nombre de un cliente
// ya registrado. Reutiliza construirOrden (misma validación de crédito,
// stock y envío que el checkout normal) pero saltando el chequeo de
// PIN/sub-usuario: acá no hay sesión de cliente de la que identificar un
// sub-usuario, la trazabilidad la da creado_por_staff_id.
export async function crearOrdenParaCliente(req, res) {
  const { usuario_id, items, forma_pago, tipo_envio, direccion_envio_id, agencia_envio } = req.body;

  if (!usuario_id) {
    return res.status(400).json({ error: 'Debes indicar el cliente para el que se crea el pedido' });
  }

  try {
    const { data: cliente, error: errorCliente } = await supabase
      .from('users')
      .select('id, activo')
      .eq('id', usuario_id)
      .single();

    if (errorCliente || !cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    if (!cliente.activo) {
      return res.status(403).json({ error: 'El cliente está desactivado' });
    }

    const orden = await construirOrden(
      usuario_id,
      { items, forma_pago, tipo_envio, direccion_envio_id, agencia_envio },
      { creado_por_staff_id: req.staff.id, saltarValidacionPin: true }
    );

    res.status(201).json(orden);
  } catch (err) {
    if (err instanceof ErrorOrden) {
      return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    }
    console.error('Error al crear orden como vendedor:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Conflicto de datos' });
    if (err.code === '23503') return res.status(400).json({ error: 'Referencia inválida' });
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /staff/admin-bridge — un staff con rol admin/administrador obtiene
// un token de CLIENTE válido (mismo formato que /auth/login) para entrar
// al panel /admin existente, sin tocar su lógica de autorización. Empareja
// por email en vez de un FK: si tu cuenta staff usa el mismo correo que
// tu cuenta users con es_admin=true, no hace falta ningún paso manual.
export async function crearBridgeAdmin(req, res) {
  try {
    const { data: user, error: errorUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', req.staff.email)
      .single();

    if (errorUser || !user) {
      return res.status(400).json({
        error: 'No existe una cuenta de cliente con este mismo correo. Creá (o editá) una cuenta cliente con este email y marcala como administradora.'
      });
    }

    if (!user.es_admin || !user.activo) {
      return res.status(403).json({ error: 'La cuenta con este correo no tiene acceso administrativo' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, es_admin: user.es_admin, nombre: user.nombre, token_version: user.token_version ?? 0 },
      process.env.JWT_SECRET,
      { expiresIn: '3d' }
    );

    const { password_hash, ...userSinPassword } = user;
    res.json({ token, user: userSinPassword });
  } catch (err) {
    console.error('Error en crearBridgeAdmin:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /staff/despacho/:id/entregar — única transición permitida para
// despachador. Reutiliza aplicarCambioEstado/validarTransicion de
// ordenes.controller.js para no duplicar la lógica de negocio (historial,
// notificación al cliente, cálculo de fecha_vencimiento en pedidos a
// crédito) — TRANSICIONES_PERMITIDAS ya solo deja pasar enviado→entregado.
export async function marcarEntregado(req, res) {
  const { id } = req.params;

  try {
    const { data: orden, error } = await supabase
      .from('ordenes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !orden) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    if (!validarTransicion(orden.estado, 'entregado')) {
      return res.status(400).json({ error: `No se puede marcar como entregado desde el estado ${orden.estado}` });
    }

    const data = await aplicarCambioEstado(orden, 'entregado');
    res.json(data);
  } catch (err) {
    console.error('Error al marcar orden como entregada:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}