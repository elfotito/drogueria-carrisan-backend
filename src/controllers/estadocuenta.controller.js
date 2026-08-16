import { supabase } from '../config/supabase.js';

// GET /:id/estado-cuenta (admin ve cualquiera, usuario se ve a sí mismo)
export async function getEstadoCuenta(req, res) {
  const { id } = req.params;
  const usuario_id = Number(id);

  if (!req.user.es_admin && req.user.id !== usuario_id) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  try {
    const { data: cliente, error: errorCliente } = await supabase
      .from('users')
      .select('id, nombre, email, linea_credito')
      .eq('id', usuario_id)
      .single();

    if (errorCliente || !cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Órdenes activas que aún pesan en la deuda: no canceladas y no verificadas.
    // Esto cubre tanto contado (esperando/reportado/rechazado) como crédito
    // (estado_pago null hasta que algún día se facture).
    const { data: ordenesDeuda, error: errorOrdenes } = await supabase
      .from('ordenes')
      .select('id, total_usd, forma_pago, estado, estado_pago, created_at')
      .eq('usuario_id', usuario_id)
      .neq('estado', 'cancelado')
      .neq('estado_pago', 'verificado');

    if (errorOrdenes) throw errorOrdenes;

    const deuda_actual = ordenesDeuda.reduce((sum, o) => sum + Number(o.total_usd), 0);

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

    res.json({
      cliente: { id: cliente.id, nombre: cliente.nombre, email: cliente.email },
      resumen: {
        linea_credito: Number(cliente.linea_credito || 0),
        deuda_actual,
        saldo: Number(cliente.linea_credito || 0) - deuda_actual,
      },
      ordenes_pendientes: ordenesDeuda,
      facturas,
      pagos,
    });
  } catch (err) {
    console.error('Error al obtener estado de cuenta:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// GET /estado-cuenta (admin) — resumen de todos los clientes con línea de crédito
export async function getResumenClientes(req, res) {
  try {
    const { data: clientes, error: errorClientes } = await supabase
      .from('users')
      .select('id, nombre, email, linea_credito')
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

        return {
          id: cliente.id,
          nombre: cliente.nombre,
          email: cliente.email,
          linea_credito: Number(cliente.linea_credito || 0),
          deuda_actual,
          saldo: Number(cliente.linea_credito || 0) - deuda_actual,
        };
      })
    );

    res.json(resumen);
  } catch (err) {
    console.error('Error al obtener resumen de clientes:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}