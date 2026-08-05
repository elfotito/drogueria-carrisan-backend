import { supabase } from '../config/supabase.js';

// GET /notifications - Obtener notificaciones del usuario autenticado
export async function getNotificaciones(req, res) {
  try {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('usuario_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al obtener notificaciones:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /notifications/unread-count - Contar no leídas (para el badge)
export async function getUnreadCount(req, res) {
  try {
    const { count, error } = await supabase
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('usuario_id', req.user.id)
      .eq('leida', false);

    if (error) throw error;
    res.json({ count });
  } catch (err) {
    console.error('Error al contar notificaciones:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /notifications/:id - Marcar como leída
export async function marcarLeida(req, res) {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', id)
      .eq('usuario_id', req.user.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error al marcar notificación:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /notifications/read-all - Marcar todas como leídas
export async function marcarTodasLeidas(req, res) {
  try {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('usuario_id', req.user.id)
      .eq('leida', false);

    if (error) throw error;
    res.json({ message: 'Todas marcadas como leídas' });
  } catch (err) {
    console.error('Error al marcar todas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// Función helper para crear notificación (usada por otros controllers)
export async function crearNotificacion(usuario_id, tipo, titulo, mensaje, orden_id = null) {
  try {
    const { error } = await supabase
      .from('notificaciones')
      .insert({ usuario_id, tipo, titulo, mensaje, orden_id });

    if (error) console.error('Error al crear notificación:', error);
  } catch (err) {
    console.error('Error al crear notificación:', err);
  }
}