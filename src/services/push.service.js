import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Envía un push a todas las subscriptions activas de un usuario.
// Si una subscription ya expiró (410/404), la borramos silenciosamente.
export async function enviarPushAlUsuario(usuario_id, { titulo, mensaje, url }) {
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('usuario_id', usuario_id);

  if (error || !subs || subs.length === 0) return;

  const payload = JSON.stringify({ titulo, mensaje, url: url || '/' });

  await Promise.all(subs.map(async sub => {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth }
    };
    try {
      await webpush.sendNotification(subscription, payload);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('Error enviando push:', err.message);
      }
    }
  }));
}