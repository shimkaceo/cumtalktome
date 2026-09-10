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

// CAPA 3: score mejorado con el fingerprint del cliente (capas 1 y 2 del
// frontend: canvas, WebGL, nucleos y velocidades de ejecucion) mas
// inconsistencias UA vs headers y deteccion de VMs cloud (AWS/GCP/Azure)
// donde corren crawlers de IA. Umbral de bloqueo 60: exige MULTIPLES
// senales combinadas; un humano real rara vez pasa de 20-35 puntos.
// Los tiempos y umbrales vienen calibrados para 48 h de logs (ver
// 'CALIBRACION' en /api/verify-turnstile) antes de apretar nada.
function calculateEnhancedRiskScore(headers, userAgent, fingerprint) {
  let score = 0;
  const ua = (userAgent || '').toLowerCase();

  // === ANALISIS DE FINGERPRINT (del frontend) ===

  if (fingerprint) {
    // Canvas vacio o muy corto: headless omite el renderizado
    if (!fingerprint.canvas || fingerprint.canvas.length < 50) {
      score += 25;
    }

    // WebGL en software/VM: Mesa, LLVM o SwiftShader son emulados
    const renderer = (fingerprint.webgl?.renderer || '').toLowerCase();
    const vendor = (fingerprint.webgl?.vendor || '').toLowerCase();

    if (renderer.includes('mesa') || renderer.includes('llvm') ||
        renderer.includes('swiftshader') || renderer.includes('software')) {
      score += 30;
    }
    void vendor; // reservado: se loguea para calibracion futura

    // Linux de escritorio (sin Android: su UA tambien contiene 'Linux')
    const esLinuxDesktop = ua.includes('linux') && !ua.includes('android');

    // HardwareConcurrency: nulo/1 = bot antiguo o VM headless minima.
    // Muchos nucleos = posible VM cloud (AWS/GCP/Azure) donde corren los
    // crawlers de IA (Grok y similares). Umbrales CONSERVADORES: un CPU
    // consumer llega a 32 logicos (Ryzen 7950X = 16C/32T, Threadripper
    // 7960X = 32); a partir de 48 ya es hierro de servidor o workstation
    // exoticos.
    const hc = fingerprint.hardwareConcurrency;
    if (hc === null || hc === undefined) {
      score += 15; // no lo reporta (bots antiguos)
    } else if (hc === 1) {
      score += 10; // muy bajo (VMs headless)
    } else if (hc >= 64) {
      score += 35; // claramente servidor cloud (64+ nucleos logicos)
    } else if (hc >= 48) {
      score += 20; // servidor high-end o Threadripper poco comun
    } else if (hc > 32 && esLinuxDesktop) {
      score += 15; // >32 nucleos en Linux: workstation/servidor
    }
    // 2-32 nucleos: sin puntuar (rango consumer normal)

    // === COMBINACIONES SOSPECHOSAS DE CLOUD ===
    // Linux x86_64 (desktop, NO Android) con specs de servidor = VM de
    // datacenter. Las GPUs de cloud (A100/H100/T4/Instinct/Tesla) no
    // existen en maquinas consumer.
    if (esLinuxDesktop && ua.includes('x86_64')) {
      const gpuServidor = /nvidia a100|nvidia h100|nvidia t4|nvidia l4|tesla|amd instinct/.test(renderer);
      const gpuConsumer = /radeon|geforce|intel|apple|mali|adreno/.test(renderer);

      if (hc >= 32 && gpuServidor) {
        score += 30; // GPU de data center + nucleos masivos
      }
      if (hc >= 64 && gpuConsumer) {
        score += 25; // GPU consumer con 64+ nucleos = VM con passthrough
      }
    }

    // === MOVIL vs DESKTOP ===
    // Ningun telefono actual supera ~8 nucleos: un UA movil con nucleos
    // de servidor es un bot mal spoofeado.
    if (/android/.test(ua) && hc > 16) {
      score += 30; // movil con nucleos fisicamente imposibles
    }
    if (/iphone|ipad/.test(ua) && hc > 8) {
      score += 25; // iOS actual: max ~8 nucleos (A17 Pro = 6)
    }

    // Velocidades sospechosas (capa 2)
    if (fingerprint.speeds) {
      if (fingerprint.speeds.canvasRender < 2) {
        score += 20; // demasiado rapido (cache/omision)
      }
      if (fingerprint.speeds.mathLoop < 5) {
        score += 15; // VM optimizada o automatizacion
      }
      if (fingerprint.speeds.total > 1000) {
        score += 10; // demasiado lento (VM sobrecargada)
      }
    }
  }

  // === INCONSISTENCIAS UA vs HEADERS ===

  // Chrome debe mandar sec-ch-ua
  if (ua.includes('chrome') && !ua.includes('edg/')) {
    if (!headers['sec-ch-ua']) {
      score += 20; // Chrome sin headers de cliente
    }
  }

  // Safari siempre manda Accept-Language completo
  if (ua.includes('safari') && !ua.includes('chrome')) {
    const acceptLang = headers['accept-language'] || '';
    if (!acceptLang || acceptLang.length < 5) {
      score += 15; // Safari sin idioma
    }
  }

  // Firefox manda Accept-Encoding con gzip
  if (ua.includes('firefox')) {
    const acceptEnc = headers['accept-encoding'] || '';
    if (!acceptEnc.includes('gzip')) {
      score += 10; // Firefox raro sin gzip
    }
  }

  // === HEADERS FALTANTES O SOSPECHOSOS ===

  // Accept incompleto (bots genericos). OJO: un fetch() del navegador
  // tambien manda */*, asi que esta senal sola no vale nada: solo pesa
  // combinada con otras.
  const accept = headers['accept'] || '';
  if (accept === '*/*' || accept === 'text/html') {
    score += 10;
  }

  // Sin Accept-Language (raro en humanos)
  if (!headers['accept-language']) {
    score += 15;
  }

  // Sec-Fetch: los navegadores modernos los mandan
  if (!headers['sec-fetch-site'] && !headers['sec-fetch-mode']) {
    score += 10; // navegador antiguo o bot
  }

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
    <h2>Test de Turnstile</h2>
    <p>Sitekey: <code>${TURNSTILE_SITE_KEY}</code></p>
    <p>Hostname: <code id="host">?</code> (debe estar en los Hostnames de este widget en el dashboard de Cloudflare)</p>
    <div id="estado">Esperando a que Turnstile resuelva...</div>

    <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onTestSuccess" data-error-callback="onTestError" data-timeout-callback="onTestError"></div>

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
        window.onTestError = function (codigo) {
            document.getElementById('estado').textContent =
                'ERROR del widget: ' + codigo +
                '. Revisa en el dashboard de Cloudflare (Turnstile, este widget, seccion Hostnames) que cumtalkto.me este en la lista.';
        };
        document.getElementById('host').textContent = location.hostname;
        setTimeout(function () {
            if (!resuelto) {
                document.getElementById('estado').textContent =
                    'TIMEOUT: Turnstile no resolvio en 12 s. Puede ser un bloqueador (adblock/shields) cortando challenges.cloudflare.com. Revisa la consola del navegador.';
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

    // CAPAS 1-3: fingerprint (canvas + WebGL + nucleos) y velocidades del
    // cliente + inconsistencias UA/headers. Umbral 60, conservador:
    // bloquea solo con MULTIPLES senales combinadas. Un success:false
    // aqui es un fallo EXPLICITO mas: el cliente manda el visitante a
    // Wikipedia. El LOG de calibracion (48 h) sirve para ver si algun
    // humano real supera 55 y ajustar antes de apretar.
    const fingerprint = body.fingerprint || null;
    const scoreFingerprint = calculateEnhancedRiskScore(request.headers, userAgent, fingerprint);
    console.log('CALIBRACION ' + JSON.stringify({
      ua: userAgent,
      score: scoreFingerprint,
      fingerprint: {
        hasCanvas: !!fingerprint?.canvas,
        webglRenderer: fingerprint?.webgl?.renderer,
        hwConc: fingerprint?.hardwareConcurrency,
        canvasMs: fingerprint?.speeds?.canvasRender,
        mathMs: fingerprint?.speeds?.mathLoop
      },
      isBlocked: scoreFingerprint >= 60
    }));
    if (scoreFingerprint >= 60) {
      console.log(`TURNSTILE: bloqueado por fingerprint (score ${scoreFingerprint}), IP=${request.ip}`);
      return response.json({ success: false, reason: 'bot_fingerprint', score: scoreFingerprint });
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
