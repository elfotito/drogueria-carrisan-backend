import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

const vapidSubject = process.env.VAPID_SUBJECT;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
  console.error('🚨  Faltan variables de entorno VAPID (VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY). Las notificaciones push NO funcionarán. Configúralas en Render.');
}

webpush.setVapidDetails(
  vapidSubject || 'mailto:noreply@example.com',
  vapidPublicKey || '',
  vapidPrivateKey || ''
);

// Códigos HTTP que indican que la subscription ya no es válida y debe eliminarse.
const SUBSCRIPTION_INVALIDA = [404, 410];

// Envía un push a todas las subscriptions activas de un usuario.
// Si una subscription ya expiró o fue revocada (410/404), la borramos.
export async function enviarPushAlUsuario(usuario_id, { titulo, mensaje, url }) {
  if (!vapidPublicKey || !vapidPrivateKey) return;

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('usuario_id', usuario_id);

  if (error || !subs || subs.length === 0) return;

  const payload = JSON.stringify({ titulo, mensaje, url: url || '/' });

  const resultados = await Promise.allSettled(subs.map(async sub => {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth }
    };

    try {
      await webpush.sendNotification(subscription, payload);
    } catch (err) {
      if (SUBSCRIPTION_INVALIDA.includes(err.statusCode)) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else if (err.statusCode === 413) {
        console.warn(`Push rechazado (payload demasiado grande) para sub ${sub.id}`);
      } else {
        console.error(`Error enviando push a sub ${sub.id}:`, err.message);
      }
    }
  }));

  const fallos = resultados.filter(r => r.status === 'rejected');
  if (fallos.length > 0) {
    console.error(`Push: ${fallos.length}/${subs.length} envíos fallaron`);
  }
}