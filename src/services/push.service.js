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

const SUBSCRIPTION_INVALIDA = [404, 410];

// Mapeo tipo de notificación -> categoría de preferencia
const TIPO_A_CATEGORIA = {
  orden_creada: 'ordenes',
  orden_confirmada: 'ordenes',
  orden_enviada: 'ordenes',
  orden_entregada: 'ordenes',
  orden_cancelada: 'ordenes',
  estado_cambiado: 'ordenes',
  orden_actualizada: 'ordenes',
  pago_registrado: 'pagos',
  pago_recibido: 'pagos',
  pago_rechazado: 'pagos',
  pago_reportado: 'pagos',
  pago_verificado: 'pagos',
  chat_mensaje: 'chat',
  orden_por_vencer: 'credito',
  orden_vencida: 'credito',
  oferta: 'ofertas',
};

function getCategoria(tipo) {
  return TIPO_A_CATEGORIA[tipo] || 'sistema';
}

async function quierePush(usuario_id, tipo) {
  try {
    const categoria = getCategoria(tipo);
    const { data } = await supabase
      .from('notificacion_preferencias')
      .select('push_activo, push_ordenes, push_pagos, push_chat, push_credito, push_sistema, push_ofertas')
      .eq('usuario_id', usuario_id)
      .single();

    if (!data) return true;
    if (!data.push_activo) return false;
    const campo = `push_${categoria}`;
    return data[campo] !== false;
  } catch {
    return true;
  }
}

export async function enviarPushAlUsuario(usuario_id, { titulo, mensaje, url, tipo }) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn(`[Push] Saltado envío a user ${usuario_id}: faltan VAPID keys en el servidor`);
    return;
  }

  if (tipo && !(await quierePush(usuario_id, tipo))) {
    console.log(`[Push] Saltado envío a user ${usuario_id}: no quiere push para tipo "${tipo}"`);
    return;
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('*')
      .eq('user_id', usuario_id);

  if (error) {
    console.error(`[Push] Error consultando suscripciones de user ${usuario_id}:`, error.message);
    return;
  }
  if (!subs || subs.length === 0) {
    console.log(`[Push] Sin suscripciones push para user ${usuario_id}`);
    return;
  }

  console.log(`[Push] Enviando a user ${usuario_id}: ${subs.length} suscripciones, tipo="${tipo}"`);

  const payload = JSON.stringify({ titulo, mensaje, url: url || '/' });

  const resultados = await Promise.allSettled(subs.map(async sub => {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    };

    try {
      await webpush.sendNotification(subscription, payload);
    } catch (err) {
      if (SUBSCRIPTION_INVALIDA.includes(err.statusCode)) {
        console.warn(`[Push] Suscripción inválida (sub ${sub.id}), eliminando`);
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else if (err.statusCode === 413) {
        console.warn(`[Push] Payload demasiado grande para sub ${sub.id}`);
      } else {
        console.error(`[Push] Error enviando a sub ${sub.id}:`, err.message, `(statusCode: ${err.statusCode})`);
      }
    }
  }));

  const exitos = resultados.filter(r => r.status === 'fulfilled');
  const fallos = resultados.filter(r => r.status === 'rejected');
  if (fallos.length > 0 || exitos.length > 0) {
    console.log(`[Push] Resultado user ${usuario_id}: ${exitos.length} éxitos, ${fallos.length} fallos`);
  }
}