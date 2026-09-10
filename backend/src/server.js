import HyperExpress from 'hyper-express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { checkBlacklist, logAccess } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import { generateToken, validateToken } from './utils/tokens.js';
import { generateBehavioralHTML, TURNSTILE_SITE_KEY } from './utils/behavioralCheck.js';
import { botUserAgents, isBot } from './utils/botDetection.js';

// Railway termina el TLS/HTTP delante de la app: el IP del socket siempre es
// un proxy interno (100.64.0.x) y cambia entre peticiones. Sin trust_proxy,
// request.ip rompe la validacion de tokens, comparte buckets de rate-limit
// entre usuarios distintos, banea a cualquiera tras un proxy en el honeypot
// y ensucia el AccessLog. Con el, se usa el IP real del visitante que
// Railway informa en X-Forwarded-For (verificado en la fuente de
// hyper-express 6.14.12: usa la primera entrada del header).
const app = new HyperExpress.Server({ trust_proxy: true });
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Si Redis cae, ioredis reintenta la conexion en bucle: sin listener, cada
// intento imprime el error sin control. Con el queda una linea por intento y
// el servidor sigue sirviendo enlaces.
redis.on('error', (error) => console.error(`Redis: ${error.message}`));

// La deteccion de bots por User-Agent vive en utils/botDetection.js,
// compartida con security.js y la ruta de diagnostico /test-bot para que
// todos los componentes clasifiquen igual.

function calculateRiskScore(headers, userAgent) {
  let score = 0;
  const ua = (userAgent || '').toLowerCase();
  if (botUserAgents.some(bot => ua.includes(bot))) score += 60;
  const accept = (headers['accept'] || '').toLowerCase();
  if (!accept.includes('image') && !accept.includes('*/*')) score += 20;
  if (!headers['referer']) score += 10;
  if (headers['x-purpose'] === 'preview') score += 15;
  if (headers['x-fetch-mode']) score += 10;
  return score;
}

// Clasificacion burda por User Agent, solo para el campo deviceType del log.
function tipoDispositivo(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (/mobile|iphone|ipod|android/.test(ua)) return 'mobile';
  if (/ipad|tablet/.test(ua)) return 'tablet';
  return 'desktop';
}

app.use(logAccess);

// HONEYPOT
app.get('/hidden/access-point', async (request, response) => {
  const ip = request.ip;
  const userAgent = request.headers['user-agent'] || 'unknown';
  
  console.log(`HONEYPOT ACTIVADO - IP: ${ip}`);
  
  await redis.setex(`blacklist:${ip}`, 86400, JSON.stringify({
    timestamp: new Date().toISOString(),
    userAgent: userAgent,
    reason: 'honeypot_triggered'
  }));
  
  response.status(404).send('Not found');
});

// Ruta de diagnostico de bots: montada ANTES de checkBlacklist y rateLimit
// para aislar la deteccion de los middlewares de seguridad. Un bot debe
// recibir aqui exactamente el mismo 302 que en /:slug; si la respuesta
// difiere entre ambas rutas, el culpable es un middleware, no la deteccion.
app.get('/test-bot', (request, response) => {
  const userAgent = request.headers['user-agent'] || '';
  if (isBot(userAgent)) {
    return response.redirect('https://en.wikipedia.org/wiki/Shinka');
  }
  return response.json({
    isBot: false,
    userAgent,
    nota: 'UA no clasificado como bot: en /:slug seguira el flujo humano'
  });
});

// Ruta de test del widget de Turnstile, tambien aislada de los middlewares
// (como /test-bot). Muestra el estado del reto invisible y el resultado de
// la verificacion del backend: sirve para comprobar que el widget carga
// antes de fiarle el flujo completo.
app.get('/test-turnstile', (request, response) => {
  const pagina = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Test Turnstile</title>
    <style>
        body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}
        #estado{padding:12px;border:1px solid #ccc;border-radius:8px;white-space:pre-wrap}
        code{background:#f4f4f4;padding:2px 6px;border-radius:4px}
    </style>
</head>
<body>
    <h2>Test de Turnstile (invisible)</h2>
    <p>Sitekey: <code>${TURNSTILE_SITE_KEY}</code></p>
    <div id="estado">Esperando a que Turnstile resuelva...</div>

    <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onTestSuccess" data-size="invisible"></div>

    <script>
        var resuelto = false;
        window.onTestSuccess = function (tokenTurnstile) {
            resuelto = true;
            fetch('/api/verify-turnstile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: tokenTurnstile })
            })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    document.getElementById('estado').textContent =
                        'Turnstile resolvio el reto.\nVerificacion del backend: ' + JSON.stringify(d);
                })
                .catch(function (e) {
                    document.getElementById('estado').textContent =
                        'Turnstile resolvio, pero fallo el POST al backend: ' + e;
                });
        };
        setTimeout(function () {
            if (!resuelto) {
                document.getElementById('estado').textContent =
                    'TIMEOUT: Turnstile no resolvio en 12 s. Revisa la consola del navegador.';
            }
        }, 12000);
    </script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</body>
</html>`;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  return response.send(pagina);
});

app.use(checkBlacklist);
app.use(rateLimit);

// Ruta principal
app.get('/:slug', async (request, response) => {
  const slug = request.params.slug;
  const userAgent = request.headers['user-agent'] || '';
  const headers = request.headers;
  
  try {
    const link = await prisma.linkVariant.findUnique({
      where: { slug },
      include: { influencer: true }
    });
    
    if (!link) return response.status(404).send('Link no encontrado');
    if (!link.isActive) return response.status(403).send('Link desactivado');
    
    const riskScore = calculateRiskScore(headers, userAgent);
    const isBotDetected = riskScore >= 50 || isBot(userAgent);
    
    console.log(`[${new Date().toISOString()}] Slug: ${slug}, Risk: ${riskScore}, IsBot: ${isBotDetected}, UA: "${userAgent}"`);
    
    // Persistir la visita en PostgreSQL: es lo que lee el panel (Shimka Lab)
    // y lo que alimenta el contador de clicks y la regla de borrado de
    // enlaces. Hasta ahora solo se escribia en una lista de Redis que nadie
    // consumia y los contadores quedaban a cero.
    // Se registra toda visita con su bandera isBot; el contador de clicks
    // solo sube para humanos: las previews de WhatsApp o Telegram no son
    // clics de verdad e inflarian la metrica del creador.
    try {
      await prisma.accessLog.create({
        data: {
          variantId: link.id,
          influencerId: link.influencerId,
          ipAddress: request.ip,
          userAgent: userAgent.substring(0, 200),
          deviceType: tipoDispositivo(userAgent),
          referrer: request.headers['referer'] || null,
          isBot: isBotDetected,
          riskScore
        }
      });
      // El webview de Instagram solo es el trampolin: behavioralCheck.js
      // rebota esa misma URL al navegador externo, que vuelve a pedir el
      // enlace y ahi si cuenta el click. Contar tambien la pierna del
      // webview duplicaria el click de cada usuario que viene de Instagram.
      const esWebviewInstagram = /instagram/i.test(userAgent);
      if (!isBotDetected && !esWebviewInstagram) {
        await prisma.linkVariant.update({
          where: { id: link.id },
          data: { clickCount: { increment: 1 } }
        });
      }
    } catch (e) {
      // Una metrica que falla no debe romper la redireccion
      console.error('Error persistiendo visita:', e.message);
    }
    
    // BOT: 302 a Wikipedia. La deteccion ocurre antes de generar token o
    // servir behavioralCheck: el bot nunca ve la pagina intermedia. La visita
    // ya quedo registrada en AccessLog con isBot=true y sin click (el guard
    // de clickCount excluye isBotDetected). Ojo: redirect() de hyper-express
    // solo acepta la URL y siempre responde 302.
    if (isBotDetected) {
      console.log(`BOT DETECTADO - Redirigiendo a Wikipedia: ${slug}`);

      return response.redirect('https://en.wikipedia.org/wiki/Shinka');
    }
    
    // HUMANO: Mostrar HTML de deteccion comportamental
    const destino = link.influencer?.urlDestino;
    if (!destino) {
      return response.status(500).send('Error: URL de destino no configurada');
    }
    
    const sessionToken = await generateToken(request.ip, userAgent);
    console.log(`HUMANO - Mostrando deteccion comportamental: ${slug}`);
    
    const behavioralHTML = generateBehavioralHTML(sessionToken, destino);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return response.send(behavioralHTML);
    
  } catch (error) {
    console.error('Error:', error);
    response.status(500).send('Error interno: ' + error.message);
  }
});

// Validar token
app.post('/api/validate-token', async (request, response) => {
  try {
    const body = await request.json();
    const isValid = await validateToken(body.token, request.ip);
    
    if (isValid) {
      response.json({ valid: true });
    } else {
      response.status(403).json({ valid: false, error: 'Token invalido' });
    }
  } catch (error) {
    response.status(500).json({ error: 'Error validando token' });
  }
});

// Endpoint para recibir resultado de deteccion comportamental
app.post('/api/behavior-check', async (request, response) => {
  try {
    const body = await request.json();
    const { token, mouseMoved, hasScrolled, screenWidth, screenHeight } = body;
    
    const isValid = await validateToken(token, request.ip);
    if (!isValid) {
      return response.status(403).json({ error: 'Token invalido' });
    }
    
    const humanScore = (mouseMoved ? 1 : 0) + (hasScrolled ? 1 : 0) + (screenWidth > 0 ? 1 : 0);
    const isHuman = humanScore >= 2;
    
    console.log(`Behavior check: IP=${request.ip}, Score=${humanScore}, Human=${isHuman}`);
    
    await redis.lpush(`behavior:${request.ip}`, JSON.stringify({
      timestamp: new Date().toISOString(),
      mouseMoved,
      hasScrolled,
      screenWidth,
      screenHeight,
      humanScore,
      isHuman
    }));
    
    response.json({ 
      success: true, 
      isHuman,
      message: isHuman ? 'Comportamiento humano verificado' : 'Comportamiento sospechoso'
    });
    
  } catch (error) {
    console.error('Error en behavior-check:', error);
    response.status(500).json({ error: 'Error procesando verificacion' });
  }
});

// Verificacion server-side del token de Cloudflare Turnstile. La pagina
// comportamental no ejecuta nada (ni rebote IG ni redireccion) hasta que
// este endpoint responde {success:true}.
app.post('/api/verify-turnstile', async (request, response) => {
  try {
    const body = await request.json();
    const tokenTurnstile = body.token;
    if (!tokenTurnstile) {
      return response.json({ success: false, error: 'token faltante' });
    }

    // Doble chequeo servidor: la pagina solo se sirve a UAs clasificados
    // como humanos, pero un headless puede llamar aqui directamente.
    const userAgent = request.headers['user-agent'] || '';
    const riskScore = calculateRiskScore(request.headers, userAgent);
    if (isBot(userAgent) || riskScore >= 50) {
      console.log(`TURNSTILE: rechazado antes de verificar (bot por UA o score ${riskScore}), IP=${request.ip}`);
      return response.json({ success: false, reason: 'bot' });
    }

    let data;
    try {
      const controlador = new AbortController();
      const alarma = setTimeout(() => controlador.abort(), 5000);
      const verificacion = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY || '0x4AAAAAAEu6U9GP7c7lK5lgb_7QA5leDe0',
          response: tokenTurnstile,
          remoteip: request.ip
        }),
        signal: controlador.signal
      });
      clearTimeout(alarma);
      data = await verificacion.json();
    } catch (e) {
      // FAIL OPEN: si Cloudflare no responde (timeout, 5xx, red), no se
      // bloquea a un humano real por una caida ajena. Se deja rastro.
      console.error(`TURNSTILE: fallo contactando Cloudflare (fail-open), IP=${request.ip}: ${e.message}`);
      return response.json({ success: true, failOpen: true });
    }

    if (data && data.success === true) {
      return response.json({ success: true });
    }

    console.log(`TURNSTILE: token rechazado por Cloudflare, IP=${request.ip}: ${JSON.stringify(data)}`);
    return response.json({ success: false });
  } catch (error) {
    console.error('TURNSTILE: error en /api/verify-turnstile:', error);
    return response.json({ success: false });
  }
});

app.get('/health', (request, response) => {
  response.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT)
  .then(() => console.log(`Servidor en puerto ${PORT} | Bot detection: ON | Security: ON | Tokens: ON | Behavioral: ON`))
  .catch((error) => console.error('Error:', error));
