import { supabase } from '../config/supabase.js';

// GET /clientes/:id/estado-cuenta (admin)
export async function getEstadoCuenta(req, res) {
  const { id } = req.params;

  try {
    // 1. Datos del cliente (incluye su línea de crédito)
    const { data: cliente, error: errorCliente } = await supabase
      .from('users')
      .select('id, nombre, email, linea_credito')
      .eq('id', id)
      .single();

    if (errorCliente || !cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // 2. Todas sus facturas
    const { data: facturas, error: errorFacturas } = await supabase
      .from('facturas')
      .select('*, factura_ordenes(orden_id)')
      .eq('usuario_id', id)
      .order('created_at', { ascending: false });

    if (errorFacturas) throw errorFacturas;

    // 3. Todos sus pagos
    const { data: pagos, error: errorPagos } = await supabase
      .from('pagos')
      .select('*, pago_facturas(factura_id)')
      .eq('usuario_id', id)
      .order('created_at', { ascending: false });

    if (errorPagos) throw errorPagos;

    // 4. Calcular totales
    const total_facturado = facturas.reduce((sum, f) => sum + Number(f.monto_facturado), 0);
    const total_pagado = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
    const deuda_actual = total_facturado - total_pagado;
    const saldo = Number(cliente.linea_credito) - deuda_actual;

    res.json({
      cliente,
      resumen: {
        total_facturado,
        total_pagado,
        deuda_actual,
        linea_credito: Number(cliente.linea_credito),
        saldo // positivo = crédito disponible, negativo = excedido/debe sin crédito
      },
      facturas,
      pagos
    });
  } catch (err) {
    console.error('Error al obtener estado de cuenta:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /clientes/estado-cuenta (admin) - resumen de TODOS los clientes, para la pestaña principal
export async function getResumenClientes(req, res) {
  try {
    const { data: clientes, error: errorClientes } = await supabase
      .from('users')
      .select('id, nombre, email, linea_credito')
      .order('nombre', { ascending: true });

    if (errorClientes) throw errorClientes;

    const { data: facturas, error: errorFacturas } = await supabase
      .from('facturas')
      .select('usuario_id, monto_facturado');

    if (errorFacturas) throw errorFacturas;

    const { data: pagos, error: errorPagos } = await supabase
      .from('pagos')
      .select('usuario_id, monto');

    if (errorPagos) throw errorPagos;

    const resumen = clientes.map(cliente => {
      const total_facturado = facturas
        .filter(f => f.usuario_id === cliente.id)
        .reduce((sum, f) => sum + Number(f.monto_facturado), 0);

      const total_pagado = pagos
        .filter(p => p.usuario_id === cliente.id)
        .reduce((sum, p) => sum + Number(p.monto), 0);

      const deuda_actual = total_facturado - total_pagado;
      const saldo = Number(cliente.linea_credito) - deuda_actual;

      return {
        ...cliente,
        total_facturado,
        total_pagado,
        deuda_actual,
        saldo
      };
    });

    res.json(resumen);
  } catch (err) {
    console.error('Error al obtener resumen de clientes:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}