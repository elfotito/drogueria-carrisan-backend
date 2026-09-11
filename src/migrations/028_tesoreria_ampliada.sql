-- 028_tesoreria_ampliada.sql
-- Tesorería ampliada: salidas internas (tipo 'salida_interna') y columna 'tercero'
-- Ejecutar a mano en Supabase SQL Editor.

-- 1) Ampliar el CHECK de tipo: ingreso | egreso | salida_interna
ALTER TABLE movimientos_caja DROP CONSTRAINT IF EXISTS movimientos_caja_tipo_check;
ALTER TABLE movimientos_caja
  ADD CONSTRAINT movimientos_caja_tipo_check
  CHECK (tipo IN ('ingreso', 'egreso', 'salida_interna'));

-- 2) Columna tercero (proveedor en egresos / cliente referencia en ingresos)
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS tercero text;

-- 3) Categorías válidas para salidas internas (transferencias y movimientos no operativos)
ALTER TABLE movimientos_caja
  ADD CONSTRAINT movimientos_caja_categoria_salida_check
  CHECK (
    tipo != 'salida_interna'
    OR categoria IN ('Transferencia a banco', 'Préstamo a personal', 'Retiro del dueño', 'Otro interno')
  );

-- 4) Índice para agrupar por tercero
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_tercero ON movimientos_caja(tercero);