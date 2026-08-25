/**
 * Verifica un token de Cloudflare Turnstile contra la API de Cloudflare.
 * Se usa en endpoints públicos sensibles a bots: registro y subida de
 * archivos de registro.
 *
 * El TURNSTILE_SECRET_KEY vive solo en variables de entorno del backend
 * (Render) — nunca se expone al cliente. El Site Key (público) sí va en
 * el frontend, son claves distintas por diseño.
 *
 * Devuelve { valido: true } o { valido: false, error: '...' }
 */
export async function verificarTurnstile(token, ipUsuario) {
  if (!token) {
    return { valido: false, error: 'Falta la verificación de seguridad' };
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    console.error('🚨  TURNSTILE_SECRET_KEY no está configurada — la verificación está DESACTIVADA por seguridad. Configúrala inmediatamente en Render.');
    return { valido: false, error: 'Error de configuración del servidor. Contacta al administrador.' };
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', secretKey);
    params.append('response', token);
    if (ipUsuario) params.append('remoteip', ipUsuario);

    const respuesta = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: params,
    });

    const resultado = await respuesta.json();

    if (!resultado.success) {
      console.warn('Turnstile rechazado:', resultado['error-codes']);
      return { valido: false, error: 'No se pudo verificar que sos una persona. Intenta de nuevo.' };
    }

    return { valido: true };
  } catch (err) {
    console.error('Error al verificar Turnstile:', err);
    // Fallo de red/timeout hacia Cloudflare: no dejamos a un usuario
    // legítimo bloqueado por un problema nuestro de conectividad.
    return { valido: true };
  }
}