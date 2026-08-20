import { supabase } from '../config/supabase.js';
import { crearNotificacion } from '../controllers/notificaciones.controller.js';

// ---------------------------------------------------------------
// Revisa órdenes a crédito cuya fecha_vencimiento ya pasó y que
// todavía no fueron notificadas, y les manda una notificación al
// cliente. Se corre una vez al día (ver arranque en server.js).
//
// No pausa nada acá — el bloqueo real del checkout se calcula en
// caliente en ordenes.controller.js a partir de si existen órdenes
// vencidas, así que este job es puramente el aviso al cliente.
// ---------------------------------------------------------------
export async function revisarVencimientos() {
  console.log('⏰ Revisando órdenes vencidas…');

  try {
    const ahora = new Date().toISOString();

    const { data: ordenesVencidas, error } = await supabase
      .from('ordenes')
      .select('id, usuario_id, total_usd, fecha_vencimiento')
      .neq('estado', 'cancelado')
      .neq('estado_pago', 'verificado')
      .eq('notificado_vencido', false)
      .not('fecha_vencimiento', 'is', null)
      .lt('fecha_vencimiento', ahora);

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
