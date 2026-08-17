import { supabase } from '../config/supabase.js';
import { crearNotificacion } from './notificaciones.controller.js';

// ---------------------------------------------------------------
// POST /reportes-pago (cliente)
// Body: { orden_ids: [1,2,3], url_comprobante: '...' }
// Crea un reporte de pago cubriendo una o varias órdenes a la vez.
// Calcula el monto en USD sumando esas órdenes, trae la tasa vigente
// y calcula el monto en Bs. Marca esas órdenes como 'reportado'.
// ---------------------------------------------------------------
export async function createReportePago(req, res) {
  const { orden_ids, url_comprobante } = req.body;
  const usuario_id = req.user.id;

  if (!orden_ids || !Array.isArray(orden_ids) || orden_ids.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos una orden' });
  }
  if (!url_comprobante) {
    return res.status(400).json({ error: 'Falta el comprobante' });
  }

  try {
    const { data: ordenes, error: errorOrdenes } = await supabase
      .from('ordenes')
      .select('id, usuario_id, forma_pago, estado_pago, total_usd')
      .in('id', orden_ids);

    if (errorOrdenes) throw errorOrdenes;
    if (!ordenes || ordenes.length !== orden_ids.length) {
      return res.status(404).json({ error: 'Una o más órdenes no existen' });
    }

    for (const orden of ordenes) {
      if (orden.usuario_id !== usuario_id) {
        return res.status(403).json({ error: 'No autorizado sobre una de las órdenes' });
      }
      if (orden.forma_pago !== 'contado') {
        return res.status(400).json({ error: `La orden #${orden.id} no es a contado` });
      }
      if (!['esperando', 'rechazado'].includes(orden.estado_pago)) {
        return res.status(400).json({ error: `La orden #${orden.id} no está disponible para reportar pago` });
      }
    }

    const { data: vinculosExistentes, error: errorVinculos } = await supabase
      .from('reporte_pago_ordenes')
      .select('orden_id')
      .in('orden_id', orden_ids);

    if (errorVinculos) throw errorVinculos;
    if (vinculosExistentes && vinculosExistentes.length > 0) {
      return res.status(409).json({ error: 'Una o más órdenes ya tienen un reporte de pago asociado' });
    }

    const { data: tasa, error: errorTasa } = await supabase
      .from('tasa_cambio')
      .select('usd_a_ves')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (errorTasa || !tasa) {
      return res.status(400).json({ error: 'No hay tasa de cambio configurada' });
    }

    const monto_usd = ordenes.reduce((sum, o) => sum + Number(o.total_usd), 0);
    const tasa_usada = Number(tasa.usd_a_ves);
    const monto_bs = monto_usd * tasa_usada;

    const { data: reporte, error: errorReporte } = await supabase
      .from('reportes_pago')
      .insert({
        usuario_id,
        monto_usd,
        monto_bs,
        tasa_usada,
        url_comprobante,
        estado: 'pendiente_verificacion'
      })
      .select()
      .single();

    if (errorReporte) throw errorReporte;

    const vinculos = orden_ids.map(orden_id => ({ reporte_pago_id: reporte.id, orden_id }));
    const { error: errorInsertVinculos } = await supabase
      .from('reporte_pago_ordenes')
      .insert(vinculos);

    if (errorInsertVinculos) {
      await supabase.from('reportes_pago').delete().eq('id', reporte.id);
      if (errorInsertVinculos.code === '23505') {
        return res.status(409).json({ error: 'Una o más órdenes ya tienen un reporte de pago asociado' });
      }
      throw errorInsertVinculos;
    }

    const { error: errorUpdateOrdenes } = await supabase
      .from('ordenes')
      .update({ estado_pago: 'reportado' })
      .in('id', orden_ids);

    if (errorUpdateOrdenes) throw errorUpdateOrdenes;

    await crearNotificacion(
      usuario_id,
      'pago_reportado',
      'Pago reportado',
      `Reportaste tu pago por Bs. ${monto_bs.toFixed(2)} (${orden_ids.length === 1 ? `orden #${orden_ids[0]}` : `${orden_ids.length} órdenes`}). Lo verificaremos pronto.`,
      null
    );

    res.status(201).json({ ...reporte, orden_ids });
  } catch (err) {
    console.error('Error al crear reporte de pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /reportes-pago (admin) — cola de verificación, filtrable por estado
export async function getReportesPago(req, res) {
  const { estado } = req.query;

  try {
    let query = supabase
      .from('reportes_pago')
      .select('*, users!reportes_pago_usuario_id_fkey(id, nombre, email), reporte_pago_ordenes(orden_id)')
      .order('created_at', { ascending: false });

    if (estado) {
      query = query.eq('estado', estado);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener reportes de pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /reportes-pago/:id (admin o dueño)
export async function getReportePagoById(req, res) {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('reportes_pago')
      .select('*, users!reportes_pago_usuario_id_fkey(id, nombre, email), reporte_pago_ordenes(orden_id, ordenes(*))')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }
    if (!req.user.es_admin && data.usuario_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error al obtener reporte de pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---------------------------------------------------------------
// PATCH /reportes-pago/:id/verificar (admin)
// Al verificar: genera una factura agrupando las órdenes del reporte,
// crea un pago que la salda de inmediato (sin parciales), y avanza
// esas órdenes de 'procesando' a 'preparando'.
// ---------------------------------------------------------------
export async function verificarReportePago(req, res) {
  const { id } = req.params;
  const { numero_factura, nota } = req.body;

  if (!numero_factura) {
    return res.status(400).json({ error: 'numero_factura es requerido para generar la factura' });
  }

  try {
    const { data: reporte, error: errorReporte } = await supabase
      .from('reportes_pago')
      .select('*, reporte_pago_ordenes(orden_id)')
      .eq('id', id)
      .single();

    if (errorReporte || !reporte) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }
    if (reporte.estado !== 'pendiente_verificacion') {
      return res.status(400).json({ error: 'Este reporte ya fue procesado' });
    }

    const orden_ids = reporte.reporte_pago_ordenes.map(v => v.orden_id);


const { data: pago, error: errorPago } = await supabase
  .from('pagos')
  .insert({
    usuario_id: reporte.usuario_id,
    monto: reporte.monto_usd,
    monto_bs: reporte.monto_bs,        // 🆕
    tasa_usada: reporte.tasa_usada,    // 🆕
    tipo: 'reporte_cliente',
    detalle: `Pago verificado desde reporte #${reporte.id}`,
    created_by: req.user.id
  })
  .select()
  .single();

    if (errorFactura) throw errorFactura;

    const registrosFacturaOrdenes = orden_ids.map(orden_id => ({ factura_id: factura.id, orden_id }));
    const { error: errorFacturaOrdenes } = await supabase
      .from('factura_ordenes')
      .insert(registrosFacturaOrdenes);

    if (errorFacturaOrdenes) {
      await supabase.from('facturas').delete().eq('id', factura.id);
      throw errorFacturaOrdenes;
    }

    const { data: pago, error: errorPago } = await supabase
      .from('pagos')
      .insert({
        usuario_id: reporte.usuario_id,
        monto: reporte.monto_usd,
        tipo: 'reporte_cliente',
        detalle: `Pago verificado desde reporte #${reporte.id} (Bs. ${Number(reporte.monto_bs).toFixed(2)} a tasa ${reporte.tasa_usada})`,
        created_by: req.user.id
      })
      .select()
      .single();

    if (errorPago) throw errorPago;

    const { error: errorPagoFactura } = await supabase
      .from('pago_facturas')
      .insert({ pago_id: pago.id, factura_id: factura.id });

    if (errorPagoFactura) throw errorPagoFactura;

    await supabase.from('facturas').update({ estado: 'pagada' }).eq('id', factura.id);

    const { data: reporteActualizado, error: errorUpdateReporte } = await supabase
      .from('reportes_pago')
      .update({
        estado: 'verificado',
        verificado_por: req.user.id,
        fecha_verificacion: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (errorUpdateReporte) throw errorUpdateReporte;

    await supabase.from('ordenes').update({ estado_pago: 'verificado' }).in('id', orden_ids);

    for (const orden_id of orden_ids) {
      await supabase.from('ordenes').update({ estado: 'preparando' }).eq('id', orden_id);
      await supabase.from('ordenes_historial').insert({ orden_id, estado: 'preparando' });
    }

    await crearNotificacion(
      reporte.usuario_id,
      'pago_verificado',
      'Pago verificado',
      `Tu pago fue verificado. ${orden_ids.length === 1 ? `Tu orden #${orden_ids[0]} está` : `Tus órdenes ${orden_ids.map(o => `#${o}`).join(', ')} están`} pasando a preparación.`,
      null
    );

    res.json({ reporte: reporteActualizado, factura, pago, orden_ids });
  } catch (err) {
    console.error('Error al verificar reporte de pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /reportes-pago/:id/rechazar (admin)
export async function rechazarReportePago(req, res) {
  const { id } = req.params;
  const { nota_rechazo } = req.body;

  try {
    const { data: reporte, error: errorReporte } = await supabase
      .from('reportes_pago')
      .select('*, reporte_pago_ordenes(orden_id)')
      .eq('id', id)
      .single();

    if (errorReporte || !reporte) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }
    if (reporte.estado !== 'pendiente_verificacion') {
      return res.status(400).json({ error: 'Este reporte ya fue procesado' });
    }

    const orden_ids = reporte.reporte_pago_ordenes.map(v => v.orden_id);

    const { data: reporteActualizado, error: errorUpdate } = await supabase
      .from('reportes_pago')
      .update({
        estado: 'rechazado',
        nota_rechazo: nota_rechazo || null,
        verificado_por: req.user.id,
        fecha_verificacion: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (errorUpdate) throw errorUpdate;

    await supabase.from('ordenes').update({ estado_pago: 'rechazado' }).in('id', orden_ids);
    await supabase.from('reporte_pago_ordenes').delete().eq('reporte_pago_id', id);

    await crearNotificacion(
      reporte.usuario_id,
      'pago_rechazado',
      'Pago rechazado',
      `Tu reporte de pago fue rechazado${nota_rechazo ? `: ${nota_rechazo}` : ''}. Puedes volver a reportarlo.`,
      null
    );

    res.json(reporteActualizado);
  } catch (err) {
    console.error('Error al rechazar reporte de pago:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}