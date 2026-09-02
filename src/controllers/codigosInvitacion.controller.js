import { supabase } from '../config/supabase.js';

const HORAS_VALIDEZ = 48;

// Genera un código alfanumérico de 6 caracteres. Excluye caracteres
// ambiguos (I, O, 0, 1) para facilitar su escritura/lectura.
function generarCodigoAlfanumerico() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 6; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)];
  }
  return codigo;
}

// POST /admin/codigos-invitacion
// Genera uno o varios códigos de invitación con expiración de 48h.
export async function generarCodigo(req, res) {
  const { cantidad = 1 } = req.body;
  const n = Math.min(Math.max(parseInt(cantidad, 10) || 1, 1), 20);

  try {
    const generados = [];
    const ahora = new Date();
    const expiraEn = new Date(ahora.getTime() + HORAS_VALIDEZ * 60 * 60 * 1000).toISOString();

    for (let i = 0; i < n; i++) {
      // Generar un código único que no exista ya en la DB
      let codigo = generarCodigoAlfanumerico();
      let existe = true;
      while (existe) {
        const { data } = await supabase
          .from('codigos_invitacion')
          .select('id')
          .eq('codigo', codigo)
          .maybeSingle();
        if (data) {
          codigo = generarCodigoAlfanumerico();
        } else {
          existe = false;
        }
      }

      const { data: nuevo, error } = await supabase
        .from('codigos_invitacion')
        .insert({
          codigo,
          usado: false,
          fecha_creacion: ahora.toISOString(),
          expira_en: expiraEn,
        })
        .select()
        .single();

      if (error) throw error;
      generados.push(nuevo);
    }

    res.status(201).json({ codigos: generados });
  } catch (err) {
    console.error('Error en generarCodigo:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /admin/codigos-invitacion
// Lista todos los códigos. Los expirados se borran de forma perezosa
// antes de responder (no hace falta cron job).
export async function listarCodigos(req, res) {
  try {
    const ahoraIso = new Date().toISOString();

    // Limpiar códigos expirados y sin usar
    await supabase
      .from('codigos_invitacion')
      .delete()
      .eq('usado', false)
      .lt('expira_en', ahoraIso);

    const { data, error } = await supabase
      .from('codigos_invitacion')
      .select(`
        id,
        codigo,
        usado,
        fecha_creacion,
        expira_en,
        fecha_uso,
        user_id,
        users:user_id ( id, nombre, email )
      `)
      .order('fecha_creacion', { ascending: false });

    if (error) throw error;

    res.json({ codigos: data || [] });
  } catch (err) {
    console.error('Error en listarCodigos:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /admin/codigos-invitacion/:id
// Elimina un código (usado para revocar uno activo o limpiar manualmente).
export async function eliminarCodigo(req, res) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'ID del código es requerido' });
  }

  try {
    const { error } = await supabase
      .from('codigos_invitacion')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ mensaje: 'Código eliminado' });
  } catch (err) {
    console.error('Error en eliminarCodigo:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /admin/codigos-invitacion/estadisticas
// Conteos para el panel: total, activos, usados, expirados.
export async function getEstadisticas(req, res) {
  try {
    const ahora = new Date();
    const ahoraIso = ahora.toISOString();

    // Limpiar expirados sin usar
    await supabase
      .from('codigos_invitacion')
      .delete()
      .eq('usado', false)
      .lt('expira_en', ahoraIso);

    const { count: total, error: errTotal } = await supabase
      .from('codigos_invitacion')
      .select('id', { count: 'exact' });

    const { count: usados, error: errUsados } = await supabase
      .from('codigos_invitacion')
      .select('id', { count: 'exact' })
      .eq('usado', true);

    if (errTotal || errUsados) throw errTotal || errUsados;

    const activos = (total || 0) - (usados || 0);

    res.json({ total: total || 0, activos, usados: usados || 0 });
  } catch (err) {
    console.error('Error en getEstadisticas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
