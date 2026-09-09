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

const botUserAgents = [
  'facebookexternalhit','facebot','googlebot','bingbot','twitterbot',
  'linkedinbot','whatsapp','telegrambot','slackbot','discordbot',
  'applebot','yandexbot','baiduspider','rogerbot','embedly',
  'quora link preview'
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
    
    try {
      await redis.lpush(`analytics:${link.id}`, JSON.stringify({
        timestamp: new Date().toISOString(),
        userAgent: userAgent.substring(0, 200),
        ip: request.ip,
        riskScore,
        isBot: isBotDetected
      }));
    } catch (e) {}
    
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
    
    // Verificar token
    const isValid = await validateToken(token, request.ip);
    if (!isValid) {
      return response.status(403).json({ error: 'Token invalido' });
    }
    
    // Analizar comportamiento
    const humanScore = (mouseMoved ? 1 : 0) + (hasScrolled ? 1 : 0) + (screenWidth > 0 ? 1 : 0);
    const isHuman = humanScore >= 2;
    
    console.log(`Behavior check: IP=${request.ip}, Score=${humanScore}, Human=${isHuman}`);
    
    // Guardar en analytics
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
