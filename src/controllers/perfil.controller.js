// backend/src/controllers/perfil.controller.js
import { supabase } from '../config/supabase.js';

const TABLA_POR_TIPO = {
  institucional: 'perfiles_institucional',
  profesional: 'perfiles_profesional',
  honorifico: 'perfiles_honorifico',
};

async function getTipoUsuario(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('tipo_usuario')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data.tipo_usuario;
}

// GET /perfil — fila del perfil del usuario autenticado según su tipo.
export async function getPerfil(req, res) {
  try {
    const tipo = await getTipoUsuario(req.user.id);
    if (!tipo) return res.status(404).json({ error: 'Usuario no encontrado' });

    const tabla = TABLA_POR_TIPO[tipo];
    if (!tabla) return res.status(400).json({ error: 'Tu cuenta no tiene perfil asociado' });

    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    res.json(data || null);
  } catch (err) {
    console.error('Error al obtener perfil:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

const DIAS_HORARIO = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

function horarioValido(horario) {
  if (!horario || typeof horario !== 'object') return false;
  return DIAS_HORARIO.every((dia) => {
    const d = horario[dia];
    if (!d || typeof d !== 'object') return false;
    if (typeof d.abierto !== 'boolean') return false;
    if (!/^\d{2}:\d{2}$/.test(d.apertura || '')) return false;
    if (!/^\d{2}:\d{2}$/.test(d.cierre || '')) return false;
    return true;
  });
}

// PATCH /perfil/horario — actualiza horario_recepcion (solo institucional).
export async function updateHorarioRecepcion(req, res) {
  try {
    const { horario_recepcion } = req.body;

    const tipo = await getTipoUsuario(req.user.id);
    if (tipo !== 'institucional') {
      return res.status(400).json({ error: 'El horario de recepción solo aplica a clientes institucionales' });
    }

    if (!horarioValido(horario_recepcion)) {
      return res.status(400).json({ error: 'Horario inválido: debe incluir los 7 días con abierto, apertura y cierre' });
    }

    const { data, error } = await supabase
      .from('perfiles_institucional')
      .update({ horario_recepcion })
      .eq('user_id', req.user.id)
      .select('horario_recepcion')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No se encontró el perfil institucional' });

    res.json({ horario_recepcion: data.horario_recepcion });
  } catch (err) {
    console.error('Error al actualizar horario de recepción:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}