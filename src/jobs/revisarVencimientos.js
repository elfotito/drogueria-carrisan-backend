import { supabase } from '../config/supabase.js';
import { crearNotificacion } from '../controllers/notificaciones.controller.js';

// ---------------------------------------------------------------
// Revisa órdenes a crédito y dispara dos avisos independientes:
//
// 1) "Por vencer" — DIAS_AVISO_PREVIO antes de fecha_vencimiento,
//    una sola vez (notificado_proximo).
// 2) "Vencida" — el día que se pasa fecha_vencimiento, una sola vez
//    (notificado_vencido). Esta parte es la que ya tenías.
//
// No pausa nada acá — el bloqueo real del checkout se calcula en
// caliente en ordenes.controller.js a partir de si existen órdenes
// vencidas, así que este job es puramente el aviso al cliente.
// ---------------------------------------------------------------

const DIAS_AVISO_PREVIO = 3;

export async function revisarVencimientos() {
  console.log('⏰ Revisando órdenes vencidas…');

  try {
    const ahora = new Date();
    const ahoraISO = ahora.toISOString();

    // ---------- 1) Por vencer ----------
    const limiteProximo = new Date(ahora);
    limiteProximo.setDate(ahora.getDate() + DIAS_AVISO_PREVIO);

    const { data: ordenesPorVencer, error: errorPorVencer } = await supabase
      .from('ordenes')
      .select('id, usuario_id, total_usd, fecha_vencimiento')
      .neq('estado', 'cancelado')
      .neq('estado_pago', 'verificado')
      .eq('notificado_proximo', false)
      .not('fecha_vencimiento', 'is', null)
      .gte('fecha_vencimiento', ahoraISO)
      .lte('fecha_vencimiento', limiteProximo.toISOString());

    if (errorPorVencer) throw errorPorVencer;

    for (const orden of ordenesPorVencer || []) {
      const diasRestantes = Math.ceil(
        (new Date(orden.fecha_vencimiento) - ahora) / (1000 * 60 * 60 * 24)
      );
      await crearNotificacion(
        orden.usuario_id,
        'orden_por_vencer',
        'Orden por vencer',
        `Tu orden #${orden.id} por $${orden.total_usd} vence en ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}.`,
        orden.id
      );
      await supabase.from('ordenes').update({ notificado_proximo: true }).eq('id', orden.id);
    }

    if (ordenesPorVencer?.length) {
      console.log(`📬 ${ordenesPorVencer.length} orden(es) por vencer notificada(s).`);
    }

    // ---------- 2) Ya vencidas (tu lógica original, sin cambios) ----------
    const { data: ordenesVencidas, error } = await supabase
      .from('ordenes')
      .select('id, usuario_id, total_usd, fecha_vencimiento')
      .neq('estado', 'cancelado')
      .neq('estado_pago', 'verificado')
      .eq('notificado_vencido', false)
      .not('fecha_vencimiento', 'is', null)
      .lt('fecha_vencimiento', ahoraISO);

    if (error) throw error;

    if (!ordenesVencidas || ordenesVencidas.length === 0) {
      console.log('✅ Sin órdenes vencidas nuevas hoy.');
      return;
    }

    for (const orden of ordenesVencidas) {
      await crearNotificacion(
        orden.usuario_id,
        'orden_vencida',
        'Orden vencida',
        `Tu orden #${orden.id} por $${orden.total_usd} venció. Regulariza tu cuenta reportando el pago para seguir comprando a crédito.`,
        orden.id
      );

      const { error: errorUpdate } = await supabase
        .from('ordenes')
        .update({ notificado_vencido: true })
        .eq('id', orden.id);

      if (errorUpdate) {
        console.error(`Error al marcar orden ${orden.id} como notificada:`, errorUpdate);
      }
    }

    console.log(`📬 ${ordenesVencidas.length} orden(es) vencida(s) notificada(s).`);
  } catch (err) {
    console.error('Error en el job de revisión de vencimientos:', err);
  }
}
