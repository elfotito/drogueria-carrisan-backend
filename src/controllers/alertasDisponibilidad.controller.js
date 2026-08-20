import { supabase } from '../config/supabase.js';
import { crearNotificacion } from './notificaciones.controller.js';

// ---------------------------------------------------------
// "Avísame cuando llegue" — para productos con precio_usd = 0.
// El cliente se suscribe una vez; cuando el admin le pone precio
// (updateProducto en productos.controller.js, ver patch) se
// notifica a todos los suscriptores y se cierra su alerta.
// ---------------------------------------------------------

// GET /products/:id/avisame — ¿el usuario actual ya está suscrito?
export async function getEstadoAlerta(req, res) {
  const { id: producto_id } = req.params;

  try {
    const { data, error } = await supabase
      .from('alertas_disponibilidad')
      .select('id')
      .eq('usuario_id', req.user.id)
      .eq('producto_id', producto_id)
      .eq('notificado', false)
      .maybeSingle();

    if (error) throw error;
    res.json({ suscrito: !!data });
  } catch (err) {
    console.error('Error al consultar alerta:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /products/:id/avisame — suscribirse
export async function suscribirseAlerta(req, res) {
  const { id: producto_id } = req.params;
  const usuario_id = req.user.id;

  try {
    const { data: existente, error: errorBusqueda } = await supabase
      .from('alertas_disponibilidad')
      .select('id')
      .eq('usuario_id', usuario_id)
      .eq('producto_id', producto_id)
      .eq('notificado', false)
      .maybeSingle();

    if (errorBusqueda) throw errorBusqueda;
    if (existente) return res.json({ suscrito: true });

    const { error } = await supabase
      .from('alertas_disponibilidad')
      .insert({ usuario_id, producto_id });

    if (error) throw error;
    res.status(201).json({ suscrito: true });
  } catch (err) {
    console.error('Error al suscribirse a la alerta:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /products/:id/avisame — cancelar suscripción
export async function cancelarAlerta(req, res) {
  const { id: producto_id } = req.params;

  try {
    const { error } = await supabase
      .from('alertas_disponibilidad')
      .delete()
      .eq('usuario_id', req.user.id)
      .eq('producto_id', producto_id)
      .eq('notificado', false);

    if (error) throw error;
    res.json({ suscrito: false });
  } catch (err) {
    console.error('Error al cancelar la alerta:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// Helper — llamado desde updateProducto cuando precio_usd pasa de 0 a
// un valor real. Notifica a todos los suscriptores activos y cierra
// sus alertas (no las borra: quedan como historial con notificado=true).
export async function notificarDisponibles(producto) {
  try {
    const { data: alertas, error } = await supabase
      .from('alertas_disponibilidad')
      .select('id, usuario_id')
      .eq('producto_id', producto.id)
      .eq('notificado', false);

    if (error) throw error;
    if (!alertas || alertas.length === 0) return;

    for (const alerta of alertas) {
      await crearNotificacion(
        alerta.usuario_id,
        'producto_disponible',
        'Producto disponible',
        `${producto.nombre_comercial} ya tiene precio y está disponible para comprar.`,
        null
      );
    }

    const idsAlertas = alertas.map((a) => a.id);
    await supabase.from('alertas_disponibilidad').update({ notificado: true }).in('id', idsAlertas);

    console.log(`📬 ${alertas.length} alerta(s) de disponibilidad notificada(s) para producto ${producto.id}`);
  } catch (err) {
    console.error('Error al notificar disponibilidad:', err);
  }
}
