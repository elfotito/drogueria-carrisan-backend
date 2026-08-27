-- 1. Tu user_id
SELECT id, email FROM users WHERE email = 'TU_EMAIL_AQUI';

-- 2. Todas las suscripciones push
SELECT id, user_id, LEFT(endpoint, 60) as endpoint_inicio, created_at
FROM push_subscriptions
ORDER BY created_at DESC
LIMIT 10;

-- 3. Total de suscripciones
SELECT COUNT(*) as total FROM push_subscriptions;

-- 4. Tus preferencias de notificacion (reemplaza 1 por tu user_id del paso 1)
SELECT * FROM notificacion_preferencias WHERE usuario_id = 1;
