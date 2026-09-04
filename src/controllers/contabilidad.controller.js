import { supabase } from '../config/supabase.js';
import { crearNotificacion } from './notificaciones.controller.js';

// =====================================================================
// Módulo de contabilidad (staff). Duplica la lógica contable que
// originalmente vive en /admin (facturas, pagos, estado de cuenta y
// reportes de pago) pero bajo sesión de staff (verifyStaffJWT +
// checkRolStaff['contabilidad'|'administrador'|'director'|'admin']).
//
// Diferencias clave vs /admin:
//   - Usa req.staff en vez de req.user (el "creador" de pagos/facturas
//     es el staff, según confirmación: created_by = req.staff.id).
//   - La autorización de "ver otro cliente" es total: cualquier rol de
//     contabilidad ve cualquier estado de cuenta (no existe el caso
//     usuario-normal-que-se-ve-a-sí-mismo acá).
// =====================================================================

// ---------------------------------------------------------------
// ESTADO DE CUENTA
// ---------------------------------------------------------------

// GET /staff/contabilidad/clientes — resumen de todos los clientes con línea de crédito.
export async function getResumenClientes(req, res) {
  try {
    const { data: clientes, error: errorClientes } = await supabase
      .from('users')
      .select('id, nombre, email, rif_cedula, telefono, linea_credito')
      .gt('linea_credito', 0);

    if (errorClientes) throw errorClientes;

    const resumen = await Promise.all(
      clientes.map(async (cliente) => {
        const { data: ordenesDeuda } = await supabase
          .from('ordenes')
          .select('total_usd')
          .eq('usuario_id', cliente.id)
          .neq('estado', 'cancelado')
          .neq('estado_pago', 'verificado');

        const deuda_actual = (ordenesDeuda || []).reduce((sum, o) => sum + Number(o.total_usd), 0);

        const { data: facturas } = await supabase
          .from('facturas')
          .select('monto')
          .eq('usuario_id', cliente.id);

        const { data: pagos } = await supabase
          .from('pagos')
          .select('monto')
          .eq('usuario_id', cliente.id);

        const total_facturado = (facturas || []).reduce((sum, f) => sum + Number(f.monto), 0);
        const total_pagado = (pagos || []).reduce((sum, p) => sum + Number(p.monto), 0);

        return {
          id: cliente.id,
          nombre: cliente.nombre,
          email: cliente.email,
          rif_cedula: cliente.rif_cedula,
          telefono: cliente.telefono,
          linea_credito: Number(cliente.linea_credito || 0),
          total_facturado,
          total_pagado,
          deuda_actual,
          saldo: Number(cliente.linea_credito || 0) - deuda_actual,
        };
      })
    );

    res.json(resumen);
  } catch (err) {
    console.error('Error al obtener resumen de clientes (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /staff/contabilidad/clientes/:id — detalle de estado de cuenta de un cliente.
export async function getEstadoCuentaCliente(req, res) {
  const { id } = req.params;
  const usuario_id = Number(id);

  try {
    const { data: cliente, error: errorCliente } = await supabase
      .from('users')
      .select('id, nombre, email, rif_cedula, telefono, linea_credito')
      .eq('id', usuario_id)
      .single();

    if (errorCliente || !cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const { data: ordenesDeudaRaw, error: errorOrdenes } = await supabase
      .from('ordenes')
      .select('id, total_usd, forma_pago, estado, estado_pago, created_at, fecha_vencimiento')
      .eq('usuario_id', usuario_id)
      .neq('estado', 'cancelado')
      .neq('estado_pago', 'verificado');

    if (errorOrdenes) throw errorOrdenes;

    const ahora = new Date();
    const ordenesDeuda = (ordenesDeudaRaw || []).map((o) => ({
      ...o,
      vencida: !!o.fecha_vencimiento && new Date(o.fecha_vencimiento) < ahora,
    }));

    const deuda_actual = ordenesDeuda.reduce((sum, o) => sum + Number(o.total_usd), 0);
    const ordenesVencidas = ordenesDeuda.filter((o) => o.vencida);
    const deuda_vencida = ordenesVencidas.reduce((sum, o) => sum + Number(o.total_usd), 0);

    const { data: facturas, error: errorFacturas } = await supabase
      .from('facturas')
      .select('*, factura_ordenes(orden_id, ordenes(id, ordenes_items(*, productos(nombre_comercial))))')
      .eq('usuario_id', usuario_id)
      .order('created_at', { ascending: false });

    if (errorFacturas) throw errorFacturas;

    const { data: pagos, error: errorPagos } = await supabase
      .from('pagos')
      .select('*, pago_facturas(factura_id)')
      .eq('usuario_id', usuario_id)
      .order('created_at', { ascending: false });

    if (errorPagos) throw errorPagos;

    const proximaAVencer = ordenesDeuda
      .filter((o) => o.fecha_vencimiento && !o.vencida)
      .sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento))[0] || null;

    res.json({
      cliente: { id: cliente.id, nombre: cliente.nombre, email: cliente.email, rif_cedula: cliente.rif_cedula, telefono: cliente.telefono },
      resumen: {
        linea_credito: Number(cliente.linea_credito || 0),
        deuda_actual,
        deuda_vencida,
        saldo: Number(cliente.linea_credito || 0) - deuda_actual,
        cantidad_ordenes_vencidas: ordenesVencidas.length,
        proxima_orden_vencer: proximaAVencer
          ? { id: proximaAVencer.id, fecha_vencimiento: proximaAVencer.fecha_vencimiento, total_usd: proximaAVencer.total_usd }
          : null,
      },
      ordenes_pendientes: ordenesDeuda,
      facturas,
      pagos,
    });
  } catch (err) {
    console.error('Error al obtener estado de cuenta (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /staff/contabilidad/clientes/:id/comparativa — comparativa mensual.
export async function getComparativaMensual(req, res) {
  const { id } = req.params;
  const usuario_id = Number(id);

  try {
    const ahora = new Date();
    const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const inicioMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString();
    const finMesPasado = inicioMesActual;

    const { data: ordenesMesActual, error: err1 } = await supabase
      .from('ordenes')
      .select('total_usd')
      .eq('usuario_id', usuario_id)
      .neq('estado', 'cancelado')
      .gte('created_at', inicioMesActual);

    if (err1) throw err1;

    const { data: ordenesMesPasado, error: err2 } = await supabase
      .from('ordenes')
      .select('total_usd')
      .eq('usuario_id', usuario_id)
      .neq('estado', 'cancelado')
      .gte('created_at', inicioMesPasado)
      .lt('created_at', finMesPasado);

    if (err2) throw err2;

    const totalMesActual = (ordenesMesActual || []).reduce((sum, o) => sum + Number(o.total_usd), 0);
    const totalMesPasado = (ordenesMesPasado || []).reduce((sum, o) => sum + Number(o.total_usd), 0);

    const variacionPorcentaje = totalMesPasado > 0
      ? ((totalMesActual - totalMesPasado) / totalMesPasado) * 100
      : null;

    res.json({
      mes_actual: totalMesActual,
      mes_pasado: totalMesPasado,
      variacion_porcentaje: variacionPorcentaje,
    });
  } catch (err) {
    console.error('Error al calcular comparativa mensual (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---------------------------------------------------------------
// PAGOS
// ---------------------------------------------------------------

// GET /staff/contabilidad/pagos?usuario_id=
export async function getPagos(req, res) {
  const { usuario_id } = req.query;

  try {
    let query = supabase
      .from('pagos')
      .select('*, pago_facturas(factura_id), users!pagos_usuario_id_fkey(id, nombre, email)')
      .order('created_at', { ascending: false });

    if (usuario_id) {
      query = query.eq('usuario_id', Number(usuario_id));
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener pagos (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /staff/contabilidad/pagos — registrar un abono, opcionalmente saldando facturas.
export async function createPago(req, res) {
  const { usuario_id, monto, tipo, detalle, factura_ids } = req.body;

  if (!usuario_id || !monto) {
    return res.status(400).json({ error: 'usuario_id y monto son requeridos' });
  }

  try {
    const { data: pago, error: errorPago } = await supabase
      .from('pagos')
      .insert({
        usuario_id: Number(usuario_id),
        monto,
        tipo: tipo || 'abono',
        detalle,
        created_by: req.staff.id,
      })
      .select()
      .single();

    if (errorPago) throw errorPago;

    if (factura_ids && factura_ids.length > 0) {
      const registros = factura_ids.map(factura_id => ({
        pago_id: pago.id,
        factura_id
      }));

      const { error: errorVinculo } = await supabase
        .from('pago_facturas')
        .insert(registros);

      if (errorVinculo) {
        await supabase.from('pagos').delete().eq('id', pago.id);
        throw errorVinculo;
      }

      const { error: errorEstado } = await supabase
        .from('facturas')
        .update({ estado: 'pagada' })
        .in('id', factura_ids);

      if (errorEstado) throw errorEstado;
    }

    const facturasTexto = factura_ids && factura_ids.length > 0
      ? ` (Facturas: ${factura_ids.join(', ')})`
      : '';

    await crearNotificacion(
      Number(usuario_id),
      'pago_registrado',
      'Pago registrado',
      `Se registró un abono por $${monto}${facturasTexto}`,
      null
    );

    res.status(201).json(pago);
  } catch (err) {
    console.error('Error al crear pago (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /staff/contabilidad/pagos/:id — anular un abono mal registrado.
export async function deletePago(req, res) {
  const { id } = req.params;

  try {
    const { data: pago, error: errorPago } = await supabase
      .from('pagos')
      .select('usuario_id, monto')
      .eq('id', id)
      .single();

    if (errorPago || !pago) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const { data: vinculos } = await supabase
      .from('pago_facturas')
      .select('factura_id')
      .eq('pago_id', id);

    if (vinculos && vinculos.length > 0) {
      const facturaIds = vinculos.map(v => v.factura_id);
      await supabase.from('facturas').update({ estado: 'pendiente' }).in('id', facturaIds);
    }

    const { error } = await supabase.from('pagos').delete().eq('id', id);
    if (error) throw error;

    await crearNotificacion(
      pago.usuario_id,
      'pago_registrado',
      'Pago anulado',
      `Se anuló un abono por $${pago.monto}. Contacta a Droguería Carrisan si crees que es un error.`,
      null
    );

    res.json({ message: 'Pago eliminado' });
  } catch (err) {
    console.error('Error al eliminar pago (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---------------------------------------------------------------
// FACTURAS
// ---------------------------------------------------------------

// GET /staff/contabilidad/facturas?usuario_id=
export async function getFacturas(req, res) {
  const { usuario_id } = req.query;

  try {
    let query = supabase
      .from('facturas')
      .select('*, factura_ordenes(orden_id), users!facturas_usuario_id_fkey(id, nombre, email)')
      .order('created_at', { ascending: false });

    if (usuario_id) {
      query = query.eq('usuario_id', Number(usuario_id));
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener facturas (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST /staff/contabilidad/facturas — crear factura, opcionalmente agrupando órdenes.
export async function createFactura(req, res) {
  const { usuario_id, numero_factura, monto_facturado, nota, orden_ids } = req.body;

  if (!usuario_id || !numero_factura || !monto_facturado) {
    return res.status(400).json({ error: 'usuario_id, numero_factura y monto_facturado son requeridos' });
  }

  try {
    const { data: factura, error: errorFactura } = await supabase
      .from('facturas')
      .insert({
        usuario_id: Number(usuario_id),
        numero_factura,
        monto_facturado,
        nota,
        created_by: req.staff.id,
      })
      .select()
      .single();

    if (errorFactura) throw errorFactura;

    if (orden_ids && orden_ids.length > 0) {
      const registros = orden_ids.map(orden_id => ({
        factura_id: factura.id,
        orden_id
      }));

      const { error: errorVinculo } = await supabase
        .from('factura_ordenes')
        .insert(registros);

      if (errorVinculo) {
        await supabase.from('facturas').delete().eq('id', factura.id);

        if (errorVinculo.code === '23505') {
          return res.status(409).json({ error: 'Una o más órdenes ya están facturadas' });
        }
        throw errorVinculo;
      }
    }

    await crearNotificacion(
      Number(usuario_id),
      'factura_emitida',
      'Factura emitida',
      `Se emitió la factura #${numero_factura} por $${monto_facturado}`,
      null
    );

    res.status(201).json(factura);
  } catch (err) {
    console.error('Error al crear factura (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /staff/contabilidad/facturas/:id — editar monto/nota/número.
export async function updateFactura(req, res) {
  const { id } = req.params;
  const { numero_factura, monto_facturado, nota } = req.body;

  try {
    const cambios = {};
    if (numero_factura !== undefined) cambios.numero_factura = numero_factura;
    if (monto_facturado !== undefined) cambios.monto_facturado = monto_facturado;
    if (nota !== undefined) cambios.nota = nota;

    const { data, error } = await supabase
      .from('facturas')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar factura (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE /staff/contabilidad/facturas/:id — corregir una factura mal generada.
export async function deleteFactura(req, res) {
  const { id } = req.params;

  try {
    const { data: factura, error: errorFactura } = await supabase
      .from('facturas')
      .select('id, usuario_id, numero_factura')
      .eq('id', id)
      .single();

    if (errorFactura || !factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const { data: vinculosPago, error: errorVinculosPago } = await supabase
      .from('pago_facturas')
      .select('pago_id')
      .eq('factura_id', id);

    if (errorVinculosPago) throw errorVinculosPago;

    if (vinculosPago && vinculosPago.length > 0) {
      const pagoIds = vinculosPago.map(v => v.pago_id);
      await supabase.from('pago_facturas').delete().eq('factura_id', id);
      await supabase.from('pagos').delete().in('id', pagoIds);
    }

    await supabase.from('factura_ordenes').delete().eq('factura_id', id);

    const { error: errorDelete } = await supabase.from('facturas').delete().eq('id', id);
    if (errorDelete) throw errorDelete;

    res.json({ message: 'Factura eliminada', factura_id: Number(id) });
  } catch (err) {
    console.error('Error al eliminar factura (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /staff/contabilidad/clientes/:id/sin-facturar — helper para armar factura nueva.
export async function getOrdenesSinFacturar(req, res) {
  const { id } = req.params;

  try {
    const { data: ordenesFacturadas, error: errorFacturadas } = await supabase
      .from('factura_ordenes')
      .select('orden_id');

    if (errorFacturadas) throw errorFacturadas;

    const idsFacturados = ordenesFacturadas.map(o => o.orden_id);

    let query = supabase
      .from('ordenes')
      .select('id, created_at, total_usd, forma_pago, estado, estado_pago')
      .eq('usuario_id', Number(id))
      .order('created_at', { ascending: false });

    if (idsFacturados.length > 0) {
      query = query.not('id', 'in', idsFacturados);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener órdenes sin facturar (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---------------------------------------------------------------
// REPORTES DE PAGO (cola de verificación)
// ---------------------------------------------------------------

// GET /staff/contabilidad/reportes-pago?estado=
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
    console.error('Error al obtener reportes de pago (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /staff/contabilidad/reportes-pago/:id/verificar — verifica un
// reporte: genera factura que salda las órdenes, crea pago, y avanza las
// órdenes de 'procesando' a 'preparando'. created_by = req.staff.id.
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

    const { data: factura, error: errorFactura } = await supabase
      .from('facturas')
      .insert({
        usuario_id: reporte.usuario_id,
        numero_factura,
        monto: reporte.monto_usd,
        monto_bs: reporte.monto_bs,
        tasa_usada: reporte.tasa_usada,
        estado: 'pendiente',
        created_by: req.staff.id,
        nota: nota || null,
      })
      .select()
      .single();

    if (errorFactura) throw errorFactura;

    const registrosFacturaOrdenes = orden_ids.map(orden_id => ({
      factura_id: factura.id,
      orden_id
    }));

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
        monto_bs: reporte.monto_bs,
        tasa_usada: reporte.tasa_usada,
        tipo: 'reporte_cliente',
        detalle: `Pago verificado desde reporte #${reporte.id} (Bs. ${Number(reporte.monto_bs).toFixed(2)} a tasa ${reporte.tasa_usada})`,
        created_by: req.staff.id,
      })
      .select()
      .single();

    if (errorPago) throw errorPago;

    const { error: errorPagoFactura } = await supabase
      .from('pago_facturas')
      .insert({
        pago_id: pago.id,
        factura_id: factura.id,
      });

    if (errorPagoFactura) throw errorPagoFactura;

    const { error: errorUpdateFactura } = await supabase
      .from('facturas')
      .update({ estado: 'pagada' })
      .eq('id', factura.id);

    if (errorUpdateFactura) throw errorUpdateFactura;

    const { data: reporteActualizado, error: errorUpdateReporte } = await supabase
      .from('reportes_pago')
      .update({
        estado: 'verificado',
        verificado_por: req.staff.id,
        fecha_verificacion: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (errorUpdateReporte) throw errorUpdateReporte;

    const { error: errorUpdatePagoOrdenes } = await supabase
      .from('ordenes')
      .update({ estado_pago: 'verificado' })
      .in('id', orden_ids);

    if (errorUpdatePagoOrdenes) throw errorUpdatePagoOrdenes;

    for (const orden_id of orden_ids) {
      const { error: errorUpdateEstado } = await supabase
        .from('ordenes')
        .update({ estado: 'preparando' })
        .eq('id', orden_id);

      if (errorUpdateEstado) throw errorUpdateEstado;

      const { error: errorHistorial } = await supabase
        .from('ordenes_historial')
        .insert({
          orden_id,
          estado: 'preparando',
        });

      if (errorHistorial) throw errorHistorial;
    }

    await crearNotificacion(
      reporte.usuario_id,
      'pago_verificado',
      'Pago verificado',
      `Tu pago fue verificado. ${orden_ids.length === 1 ? `Tu orden #${orden_ids[0]} está` : `Tus órdenes ${orden_ids.map(o => `#${o}`).join(', ')} están`} pasando a preparación.`,
      null
    );

    res.json({
      reporte: reporteActualizado,
      factura,
      pago,
      orden_ids,
    });
  } catch (err) {
    console.error('Error al verificar reporte de pago (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// PATCH /staff/contabilidad/reportes-pago/:id/rechazar
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
        verificado_por: req.staff.id,
        fecha_verificacion: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (errorUpdate) throw errorUpdate;

    const { error: errorUpdateOrdenes } = await supabase
      .from('ordenes')
      .update({ estado_pago: 'rechazado' })
      .in('id', orden_ids);

    if (errorUpdateOrdenes) throw errorUpdateOrdenes;

    const { error: errorDeleteVinculos } = await supabase
      .from('reporte_pago_ordenes')
      .delete()
      .eq('reporte_pago_id', id);

    if (errorDeleteVinculos) throw errorDeleteVinculos;

    await crearNotificacion(
      reporte.usuario_id,
      'pago_rechazado',
      'Pago rechazado',
      `Tu reporte de pago fue rechazado${nota_rechazo ? `: ${nota_rechazo}` : ''}. Puedes volver a reportarlo.`,
      null
    );

    res.json(reporteActualizado);
  } catch (err) {
    console.error('Error al rechazar reporte de pago (contabilidad):', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
