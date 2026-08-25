import { supabase } from '../config/supabase.js';

// ---------------------------------------------------------
// Dashboard de analítica — Admin.
// Por ahora solo la métrica de ventas/ingresos por período.
// Las órdenes a crédito cuentan como venta desde su creación
// (no se espera a que se paguen/facturen). Se excluyen las
// órdenes con estado 'cancelado'.
// ---------------------------------------------------------

function normalizarAgrupacion(agrupacion) {
  return ['dia', 'semana', 'mes'].includes(agrupacion) ? agrupacion : 'dia';
}

// Devuelve la clave de período para una fecha dada, según la agrupación.
// 'semana' usa el lunes de esa semana como clave (ISO-ish, sin librerías extra).
function claveDePeriodo(fechaISO, agrupacion) {
  const fecha = new Date(fechaISO);

  if (agrupacion === 'mes') {
    const año = fecha.getUTCFullYear();
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    return `${año}-${mes}`;
  }

  if (agrupacion === 'semana') {
    const dia = fecha.getUTCDay(); // 0 = domingo
    const diffAlLunes = dia === 0 ? -6 : 1 - dia;
    const lunes = new Date(fecha);
    lunes.setUTCDate(fecha.getUTCDate() + diffAlLunes);
    return lunes.toISOString().slice(0, 10);
  }

  // 'dia'
  return fecha.toISOString().slice(0, 10);
}

// Suma total_usd y cuenta órdenes agrupando por período.
function agregarPorPeriodo(ordenes, agrupacion) {
  const mapa = new Map();

  for (const orden of ordenes) {
    const clave = claveDePeriodo(orden.created_at, agrupacion);
    const actual = mapa.get(clave) || { periodo: clave, total: 0, cantidad_ordenes: 0 };
    actual.total += Number(orden.total_usd);
    actual.cantidad_ordenes += 1;
    mapa.set(clave, actual);
  }

  return Array.from(mapa.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
}

// GET /admin/analytics/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&agrupacion=dia|semana|mes
export async function getVentasPorPeriodo(req, res) {
  const agrupacion = normalizarAgrupacion(req.query.agrupacion);

  // Rango por defecto: últimos 30 días si no se especifica.
  const hasta = req.query.hasta ? new Date(req.query.hasta) : new Date();
  const desde = req.query.desde
    ? new Date(req.query.desde)
    : new Date(hasta.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fin de día inclusivo para 'hasta'.
  const hastaFinDelDia = new Date(hasta);
  hastaFinDelDia.setUTCHours(23, 59, 59, 999);

  // Período anterior, misma duración, para calcular el % de variación.
  const duracionMs = hastaFinDelDia.getTime() - desde.getTime();
  const desdeAnterior = new Date(desde.getTime() - duracionMs - 1);
  const hastaAnterior = new Date(desde.getTime() - 1);

  try {
    const { data: ordenesActuales, error: errorActuales } = await supabase
      .from('ordenes')
      .select('id, total_usd, created_at')
      .neq('estado', 'cancelado')
      .gte('created_at', desde.toISOString())
      .lte('created_at', hastaFinDelDia.toISOString());

    if (errorActuales) throw errorActuales;

    const { data: ordenesAnteriores, error: errorAnteriores } = await supabase
      .from('ordenes')
      .select('total_usd')
      .neq('estado', 'cancelado')
      .gte('created_at', desdeAnterior.toISOString())
      .lte('created_at', hastaAnterior.toISOString());

    if (errorAnteriores) throw errorAnteriores;

    const serie = agregarPorPeriodo(ordenesActuales, agrupacion);

    const totalActual = ordenesActuales.reduce((sum, o) => sum + Number(o.total_usd), 0);
    const totalAnterior = ordenesAnteriores.reduce((sum, o) => sum + Number(o.total_usd), 0);
    const cantidadOrdenes = ordenesActuales.length;
    const promedioPorOrden = cantidadOrdenes > 0 ? totalActual / cantidadOrdenes : 0;

    const variacionPorcentual = totalAnterior > 0
      ? ((totalActual - totalAnterior) / totalAnterior) * 100
      : null; // null = sin base de comparación (período anterior sin ventas)

    res.json({
      resumen: {
        total_usd: totalActual,
        cantidad_ordenes: cantidadOrdenes,
        promedio_por_orden: promedioPorOrden,
        variacion_porcentual: variacionPorcentual
      },
      serie
    });
  } catch (err) {
    console.error('Error al obtener analítica de ventas:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /admin/analytics/clientes — estado de cuenta de cada cliente
// (línea de crédito, facturado, pagado, deuda y saldo disponible).
export async function getEstadoCuentaClientes(req, res) {
  try {
    const { data: clientes, error: errorClientes } = await supabase
      .from('users')
      .select('id, nombre, email, linea_credito')
      .eq('es_admin', false);

    if (errorClientes) throw errorClientes;

    const { data: facturas, error: errorFacturas } = await supabase
      .from('facturas')
      .select('usuario_id, monto_facturado');
    if (errorFacturas) throw errorFacturas;

    const { data: pagos, error: errorPagos } = await supabase
      .from('pagos')
      .select('usuario_id, monto');
    if (errorPagos) throw errorPagos;

    const facturadoPorCliente = new Map();
    for (const f of facturas) {
      facturadoPorCliente.set(f.usuario_id, (facturadoPorCliente.get(f.usuario_id) || 0) + Number(f.monto_facturado));
    }
    const pagadoPorCliente = new Map();
    for (const p of pagos) {
      pagadoPorCliente.set(p.usuario_id, (pagadoPorCliente.get(p.usuario_id) || 0) + Number(p.monto));
    }

    const resultado = clientes.map(cliente => {
      const total_facturado = facturadoPorCliente.get(cliente.id) || 0;
      const total_pagado = pagadoPorCliente.get(cliente.id) || 0;
      const deuda_actual = total_facturado - total_pagado;
      const saldo_disponible = Number(cliente.linea_credito) - deuda_actual;

      return {
        id: cliente.id,
        nombre: cliente.nombre,
        email: cliente.email,
        linea_credito: Number(cliente.linea_credito),
        total_facturado,
        total_pagado,
        deuda_actual,
        saldo_disponible
      };
    });

    // Clientes con más deuda primero — son los que más le interesan al admin.
    resultado.sort((a, b) => b.deuda_actual - a.deuda_actual);

    res.json(resultado);
  } catch (err) {
    console.error('Error al obtener estado de cuenta de clientes:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}