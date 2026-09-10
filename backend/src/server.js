import HyperExpress from 'hyper-express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { generateSemanticHTML } from './utils/contentGenerator.js';
import { checkBlacklist, logAccess } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import { generateToken, validateToken } from './utils/tokens.js';
import { generateBehavioralHTML } from './utils/behavioralCheck.js';

const app = new HyperExpress.Server();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Si Redis cae, ioredis reintenta la conexion en bucle: sin listener, cada
// intento imprime el error sin control. Con el queda una linea por intento y
// el servidor sigue sirviendo enlaces.
redis.on('error', (error) => console.error(`Redis: ${error.message}`));

const botUserAgents = [
  'facebookexternalhit','facebot','googlebot','bingbot','twitterbot',
  'linkedinbot','whatsapp','telegrambot','slackbot','discordbot',
  'applebot','yandexbot','baiduspider','rogerbot','embedly',
  'quora link preview', 'reddit', 'redditbot', 'Redditbot'
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return botUserAgents.some(bot => ua.includes(bot));
}

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
    
    console.log(`[${new Date().toISOString()}] Slug: ${slug}, Risk: ${riskScore}, IsBot: ${isBotDetected}`);
    
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
    
    // BOT: Mostrar contenido semantico
    if (isBotDetected) {
      console.log(`BOT DETECTADO - Mostrando contenido semantico: ${slug}`);
      
      const linkData = {
        slug: link.slug,
        title: link.influencer?.nombre || 'Explorando Nuevas Perspectivas',
        description: link.influencer?.categoria || 'Contenido exclusivo',
        category: link.influencer?.categoria?.toLowerCase() || 'lifestyle',
        image: '/assets/hero-1.jpg',
        author: link.influencer?.nombre || 'Content Creator'
      };
      
      const semanticHTML = generateSemanticHTML(linkData, 'bot');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('X-Robots-Tag', 'index, follow');
      return response.send(semanticHTML);
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

app.get('/health', (request, response) => {
  response.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT)
  .then(() => console.log(`Servidor en puerto ${PORT} | Bot detection: ON | Security: ON | Tokens: ON | Behavioral: ON`))
  .catch((error) => console.error('Error:', error));
