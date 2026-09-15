-- 032_categorias_tienda.sql
-- Categorías del catálogo de la tienda (filtro por sistema terapéutico) + asignación N:N por producto.
-- Reglas de clasificación (ATC + keywords de respaldo) viven en src/config/categoriasTienda.js
-- y el backfill en scripts/clasificar-categorias.mjs.

CREATE TABLE IF NOT EXISTS categorias_tienda (
  id     text PRIMARY KEY,
  nombre text NOT NULL,
  icono  text NOT NULL,      -- nombre del icono Lucide (ver mapping en Catalogo.jsx)
  orden  integer NOT NULL
);

CREATE TABLE IF NOT EXISTS producto_categorias (
  producto_id integer NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  categoria   text    NOT NULL REFERENCES categorias_tienda(id),
  PRIMARY KEY (producto_id, categoria)
);

CREATE INDEX IF NOT EXISTS idx_producto_categorias_categoria
  ON producto_categorias (categoria);

-- Seed de las 16 categorías (idempotente)
INSERT INTO categorias_tienda (id, nombre, icono, orden) VALUES
  ('analgesicos',      'Analgésicos y antiinflamatorios', 'Pill',        1),
  ('cardiovascular',   'Cardiovascular',                  'HeartPulse',  2),
  ('antidiabeticos',   'Antidiabéticos',                  'Activity',    3),
  ('digestivo',        'Estómago y digestión',            'Utensils',    4),
  ('vitaminas',        'Vitaminas y suplementos',         'Citrus',      5),
  ('nervioso',         'Sistema nervioso',                'Brain',       6),
  ('alergia',          'Alergia',                         'Flower2',     7),
  ('respiratorio',     'Respiratorio',                    'Wind',        8),
  ('tos-resfriado',    'Tos, resfriado y garganta',       'Thermometer', 9),
  ('piel',             'Cuidado de la piel',              'HandHeart',   10),
  ('ojos-oidos',       'Ojos y oídos',                    'Eye',         11),
  ('antiinfecciosos',  'Antiinfecciosos',                 'ShieldPlus',  12),
  ('antiparasitarios', 'Antiparasitarios',                'Bug',         13),
  ('salud-femenina',   'Salud femenina',                  'Venus',       14),
  ('salud-masculina',  'Salud masculina y urológico',     'Mars',        15),
  ('hospitalario',     'Hospitalario e insumos',          'Cross',       16)
ON CONFLICT (id) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      icono  = EXCLUDED.icono,
      orden  = EXCLUDED.orden;