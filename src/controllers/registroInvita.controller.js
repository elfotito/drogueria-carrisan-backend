import crypto from 'crypto';
import { supabase } from '../config/supabase.js';

// Configuración del candado /registro/invita (una sola fila, id = 1).
async function obtenerConfig() {
  const { data, error } = await supabase
    .from('registro_invita_config')
    .select('id, habilitado, token')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// GET /registro-invita/status?t=...
// Pública: dice si el token de la URL habilita la página de invitación.
export async function getStatus(req, res) {
  const { t } = req.query;
  try {
    const cfg = await obtenerConfig();
    if (!cfg) {
      return res.status(500).json({ error: 'Configuración no disponible' });
    }
    const habilitado = cfg.habilitado === true;
    const valido = habilitado && typeof t === 'string' && t.length > 0 && t === cfg.token;
    res.json({ habilitado, valido });
  } catch (err) {
    console.error('Error en getStatus (registro_invita):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /registro-invita/config — solo admin. Devuelve el estado y el token
// vigente para que el panel construya el enlace compartible.
export async function getConfig(req, res) {
  try {
    const cfg = await obtenerConfig();
    if (!cfg) {
      return res.status(500).json({ error: 'Configuración no disponible' });
    }
    res.json({ habilitado: cfg.habilitado === true, token: cfg.token });
  } catch (err) {
    console.error('Error en getConfig (registro_invita):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /registro-invita/config — solo admin.
// Body: { habilitado?: boolean, regenerar?: boolean }
// - habilitado: apaga/enciende la página (ningún token funciona si está apagada).
// - regenerar: genera un token nuevo (el enlace anterior muere al instante).
export async function actualizarConfig(req, res) {
  const { habilitado, regenerar } = req.body || {};
  try {
    const cfg = await obtenerConfig();
    if (!cfg) {
      return res.status(500).json({ error: 'Configuración no disponible' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (typeof habilitado === 'boolean') updates.habilitado = habilitado;
    if (regenerar) updates.token = crypto.randomBytes(15).toString('hex');

    const { data, error } = await supabase
      .from('registro_invita_config')
      .update(updates)
      .eq('id', 1)
      .select('id, habilitado, token')
      .single();
    if (error) throw error;

    res.json({ habilitado: data.habilitado === true, token: data.token });
  } catch (err) {
    console.error('Error en actualizarConfig (registro_invita):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}