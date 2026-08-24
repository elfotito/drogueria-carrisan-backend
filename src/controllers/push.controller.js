import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

// Configuración VAPID: identifica a este backend ante los navegadores.
// El "mailto" es requerido por el estándar Web Push para que los
// proveedores (Chrome/Firefox push services) tengan cómo contactarte
// si tu servidor está enviando push abusivos.
webpush.setVapidDetails(
  'mailto:tesoreria.dcarrisan@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// POST /push/suscribir (requiere sesión: verifyJWT)
// El frontend manda la suscripción que le dio el navegador tras
// aceptar el permiso de notificaciones. Se guarda o actualiza (si ya
// existía ese endpoint, por ejemplo el usuario re-otorgó el permiso).
export async function suscribir(req, res) {
  const { endpoint, keys } = req.body;
  const userId = req.user.id;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }

  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: req.headers['user-agent'] || null,
        },
        { onConflict: 'endpoint' }
      );

    if (error) throw error;
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Error al guardar suscripción push:', err);
    res.status(500).json({ error: 'No se pudo guardar la suscripción' });
  }
}

// POST /push/desuscribir (requiere sesión: verifyJWT)
// Se llama cuando el usuario desactiva las notificaciones desde su
// dispositivo — borra esa suscripción puntual, no todas las del user.
export async function desuscribir(req, res) {
  const { endpoint } = req.body;
  const userId = req.user.id;

  if (!endpoint) {
    return res.status(400).json({ error: 'Falta el endpoint de la suscripción' });
  }

  try {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    res.json({ ok: true });
  } catch (err) {
    console.error('Error al eliminar suscripción push:', err);
    res.status(500).json({ error: 'No se pudo eliminar la suscripción' });
  }
}

// Función interna (no es una ruta) para enviar un push a todas las
// suscripciones activas de un usuario. La usan otros controllers
// (ej: al cambiar el estado de un pedido) — no se expone como endpoint.
// Si una suscripción ya no es válida (410 Gone — el usuario desinstaló
// o revocó el permiso), se borra sola para no seguir intentando.
export async function enviarPushAUsuario(userId, { titulo, cuerpo, url }) {
  try {
    const { data: suscripciones, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (error || !suscripciones?.length) return;

    const payload = JSON.stringify({ titulo, cuerpo, url: url || '/' });

    await Promise.all(
      suscripciones.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Suscripción muerta (navegador la invalidó) — la limpiamos.
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          } else {
            console.error('Error al enviar push:', err.message);
          }
        }
      })
    );
  } catch (err) {
    console.error('Error en enviarPushAUsuario:', err);
  }
}