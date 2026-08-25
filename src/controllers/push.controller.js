import { supabase } from '../config/supabase.js';

// GET /push/public-key
export function getPublicKey(req, res) {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
}

// POST /push/subscribe
export async function suscribir(req, res) {
  const usuario_id = req.user.id;
  const { endpoint, keys } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Subscription inválida' });
  }

  try {
    // Evita duplicados: un mismo endpoint no debería repetirse.
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { usuario_id, endpoint, keys_p256dh: keys.p256dh, keys_auth: keys.auth },
        { onConflict: 'endpoint' }
      );

    if (error) throw error;
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Error al guardar subscription:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /push/subscribe
export async function desuscribir(req, res) {
  const { endpoint } = req.body;
  try {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al eliminar subscription:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}