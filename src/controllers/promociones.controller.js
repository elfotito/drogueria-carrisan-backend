import { supabase } from '../config/supabase.js';
import webpush from 'web-push';

// GET /promotions/templates - Listar plantillas (admin)
export async function getPlantillas(req, res) {
  try {
    const { data, error } = await supabase
      .from('promociones_plantillas')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al obtener plantillas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /promotions/templates - Crear plantilla (admin)
export async function crearPlantilla(req, res) {
  const { titulo, mensaje, descuento_pct, codigo_cupon, imagen_url } = req.body;

  if (!titulo || !mensaje) {
    return res.status(400).json({ error: 'Título y mensaje son requeridos' });
  }

  try {
    const { data, error } = await supabase
      .from('promociones_plantillas')
      .insert({ titulo, mensaje, descuento_pct, codigo_cupon, imagen_url })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear plantilla:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PUT /promotions/templates/:id - Actualizar plantilla (admin)
export async function actualizarPlantilla(req, res) {
  const { id } = req.params;
  const { titulo, mensaje, descuento_pct, codigo_cupon, imagen_url, activa } = req.body;

  try {
    const updates = {};
    if (titulo !== undefined) updates.titulo = titulo;
    if (mensaje !== undefined) updates.mensaje = mensaje;
    if (descuento_pct !== undefined) updates.descuento_pct = descuento_pct;
    if (codigo_cupon !== undefined) updates.codigo_cupon = codigo_cupon;
    if (imagen_url !== undefined) updates.imagen_url = imagen_url;
    if (activa !== undefined) updates.activa = activa;

    const { data, error } = await supabase
      .from('promociones_plantillas')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al actualizar plantilla:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /promotions/templates/:id - Eliminar plantilla (admin)
export async function eliminarPlantilla(req, res) {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('promociones_plantillas')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al eliminar plantilla:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /promotions/send/:id - Enviar promoción a todos los usuarios (admin)
export async function enviarPromocion(req, res) {
  const { id } = req.params;

  try {
    const { data: plantilla, error: errorPlantilla } = await supabase
      .from('promociones_plantillas')
      .select('*')
      .eq('id', id)
      .single();

    if (errorPlantilla || !plantilla) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    // Obtener todos los usuarios con push activo y categoría ofertas
    const { data: preferencias, error: errorPrefs } = await supabase
      .from('notificacion_preferencias')
      .select('usuario_id')
      .eq('push_activo', true)
      .eq('push_ofertas', true);

    if (errorPrefs) throw errorPrefs;

    const usuarioIds = (preferencias || []).map(p => p.usuario_id);

    // También incluir usuarios sin preferencias (defaults: ofertas=true)
    const { data: todosConSub } = await supabase
      .from('push_subscriptions')
      .select('user_id')
      .neq('user_id', null);

    const todosIds = [...new Set([
      ...usuarioIds,
      ...(todosConSub || []).map(s => s.user_id).filter(uid => !usuarioIds.includes(uid)),
    ])];

    let enviadas = 0;
    let fallos = 0;
    const url = '/';

    for (const usuario_id of todosIds) {
      try {
        // Crear notificación in-app
        await supabase
          .from('notificaciones')
          .insert({
            usuario_id,
            tipo: 'oferta',
            titulo: plantilla.titulo,
            mensaje: plantilla.mensaje,
            orden_id: null,
          });

        // Enviar push si el usuario tiene suscripciones activas
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', usuario_id);

        if (subs && subs.length > 0) {
          const payload = JSON.stringify({
            titulo: plantilla.titulo,
            mensaje: plantilla.mensaje,
            url,
          });

          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                payload
              );
              enviadas++;
            } catch (err) {
              fallos++;
              if ([404, 410].includes(err.statusCode)) {
                await supabase.from('push_subscriptions').delete().eq('id', sub.id);
              }
            }
          }
        }
      } catch {
        fallos++;
      }
    }

    // Registrar en historial
    await supabase
      .from('promociones_enviadas')
      .insert({
        plantilla_id: plantilla.id,
        titulo: plantilla.titulo,
        mensaje: plantilla.mensaje,
        descuento_pct: plantilla.descuento_pct,
        codigo_cupon: plantilla.codigo_cupon,
        usuarios_total: todosIds.length,
        enviadas,
        fallos,
      });

    res.json({
      ok: true,
      usuarios_total: todosIds.length,
      enviadas,
      fallos,
    });
  } catch (err) {
    console.error('Error al enviar promoción:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /promotions/send-custom - Enviar promoción personalizada a todos (admin)
export async function enviarPromocionCustom(req, res) {
  const { titulo, mensaje, descuento_pct, codigo_cupon } = req.body;

  if (!titulo || !mensaje) {
    return res.status(400).json({ error: 'Título y mensaje son requeridos' });
  }

  try {
    const { data: preferencias } = await supabase
      .from('notificacion_preferencias')
      .select('usuario_id')
      .eq('push_activo', true)
      .eq('push_ofertas', true);

    const usuarioPrefsIds = (preferencias || []).map(p => p.usuario_id);

    const { data: todosConSub } = await supabase
      .from('push_subscriptions')
      .select('user_id')
      .neq('user_id', null);

    const todosIds = [...new Set([
      ...usuarioPrefsIds,
      ...(todosConSub || []).map(s => s.user_id).filter(uid => !usuarioPrefsIds.includes(uid)),
    ])];

    let enviadas = 0;
    let fallos = 0;
    const url = '/';

    for (const usuario_id of todosIds) {
      try {
        await supabase
          .from('notificaciones')
          .insert({
            usuario_id,
            tipo: 'oferta',
            titulo,
            mensaje,
            orden_id: null,
          });

        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', usuario_id);

        if (subs && subs.length > 0) {
          const payload = JSON.stringify({ titulo, mensaje, url });

          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                payload
              );
              enviadas++;
            } catch (err) {
              fallos++;
              if ([404, 410].includes(err.statusCode)) {
                await supabase.from('push_subscriptions').delete().eq('id', sub.id);
              }
            }
          }
        }
      } catch {
        fallos++;
      }
    }

    await supabase
      .from('promociones_enviadas')
      .insert({
        titulo,
        mensaje,
        descuento_pct,
        codigo_cupon,
        usuarios_total: todosIds.length,
        enviadas,
        fallos,
      });

    res.json({ ok: true, usuarios_total: todosIds.length, enviadas, fallos });
  } catch (err) {
    console.error('Error al enviar promoción custom:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /promotions/history - Historial de envíos (admin)
export async function getHistorial(req, res) {
  try {
    const { data, error } = await supabase
      .from('promociones_enviadas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al obtener historial:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
