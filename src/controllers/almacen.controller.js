import { supabase } from '../config/supabase.js';
import { validarTransicion, aplicarCambioEstado, ErrorOrden } from './ordenes.controller.js';

// GET /staff/almacen — cola de preparación: órdenes en 'procesando' o
// 'preparando', las más antiguas primero (orden de trabajo). El
// almacenista decide si avanza a 'preparando' (procesando→preparando) o
// 'enviado' (preparando→enviado) según el punto del pipeline en que esté.
export async function getColaAlmacen(req, res) {
  try {
    const { data, error } = await supabase
      .from('ordenes')
      .select('*, users(id, nombre, email, telefono), direcciones_envio(direccion, ciudad, estado), ordenes_items(*, productos(nombre_comercial))')
      .in('estado', ['procesando', 'preparando'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json((data || []).map(o => ({
      ...o,
      ordenes_items: Array.isArray(o.ordenes_items) ? o.ordenes_items : []
    })));
  } catch (err) {
    console.error('Error al obtener cola de almacén:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /staff/almacen/:id/preparando — transición procesando→preparando,
// única permitida para el almacenista sobre una orden en 'procesando'.
export async function marcarPreparando(req, res) {
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

    if (!validarTransicion(orden.estado, 'preparando')) {
      return res.status(400).json({ error: `No se puede pasar a preparando desde el estado ${orden.estado}` });
    }

    const data = await aplicarCambioEstado(orden, 'preparando');
    res.json(data);
  } catch (err) {
    console.error('Error al marcar orden como preparando:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /staff/almacen/:id/enviado — transición preparando→enviado.
// Si la orden ya llegó directo a 'preparando' (así lo hace el flujo de
// confirmación), el almacenista solo la marca como enviada.
export async function marcarEnviado(req, res) {
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

    if (!validarTransicion(orden.estado, 'enviado')) {
      return res.status(400).json({ error: `No se puede marcar como enviado desde el estado ${orden.estado}` });
    }

    const data = await aplicarCambioEstado(orden, 'enviado');
    res.json(data);
  } catch (err) {
    console.error('Error al marcar orden como enviada:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
