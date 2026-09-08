-- 023_producto_costos.sql
-- Multi-proveedor: tabla de costos de compra por proveedor.
-- Cada proveedor (COBECA, Drovencentro, futuro) registra su costo por producto.
-- productos.costo_usd se deriva del MINIMO de los costos por proveedor
-- ("el mas barato gana") y productos.precio_usd = round(costo_usd / 0.6, 2).
-- Idempotente.
CREATE TABLE IF NOT EXISTS public.producto_costos (
    proveedor   text NOT NULL,
    producto_id integer NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
    costo_usd   numeric NOT NULL CHECK (costo_usd >= 0),
    fecha       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (proveedor, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_producto_costos_producto_id
    ON public.producto_costos (producto_id);
