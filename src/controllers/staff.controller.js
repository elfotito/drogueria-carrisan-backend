import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';
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

    // Mismo patrón que el login de clientes: token_version embebido para
    // poder revocar la sesión sin esperar a que expire el JWT.
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