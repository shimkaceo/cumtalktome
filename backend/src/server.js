import HyperExpress from 'hyper-express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { generateSemanticHTML } from './utils/contentGenerator.js';
import { checkBlacklist, logAccess } from './middleware/security.js';

const app = new HyperExpress.Server();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Lista de user agents de bots conocidos
const botUserAgents = [
  'facebookexternalhit','facebot','googlebot','bingbot','twitterbot',
  'linkedinbot','whatsapp','telegrambot','slackbot','discordbot',
  'applebot','yandexbot','baiduspider','rogerbot','embedly',
  'quora link preview'
];

// Función para detectar si es un bot
function isBot(bot) {
  if (!bot) return false;
  const ua = bot.toLowerCase();
  return botUserAgents.some(bot => ua.includes(bot));
}

// Función para calcular risk score
function calculateRiskScore(headers, bot) {
  let score = 0;
  const ua = (bot || '').toLowerCase();
  if (botUserAgents.some(bot => ua.includes(bot))) score += 60;
  const accept = (headers['accept'] || '').toLowerCase();
  if (!accept.includes('image') && !accept.includes('*/*')) score += 20;
  if (!headers['referer']) score += 10;
  if (headers['x-purpose'] === 'preview') score += 15;
  if (headers['x-fetch-mode']) score += 10;
  return score;
}

// Middleware global: logging de accesos sospechosos
app.use(logAccess);

// RUTA HONEYPOT (antes del blacklist, para que funcione)
app.get('/hidden/access-point', async (request, response) => {
  const ip = request.ip;
  const bot = request.headers['user-agent'] || 'unknown';
  
  console.log(`🚨 HONEYPOT ACTIVADO - IP: ${ip}`);
  
  // Guardar en lista negra por 24 horas
  await redis.setex(`blacklist:${ip}`, 86400, JSON.stringify({
    timestamp: new Date().toISOString(),
    bot: bot,
    reason: 'honeypot_triggered'
  }));
  
  response.status(404).send('Not found');
});

// Middleware de blacklist para el resto de rutas
app.use(checkBlacklist);

// Ruta principal de links (tu código actual)
app.get('/:slug', async (request, response) => {
  const slug = request.params.slug;
  const bot = request.headers['user-agent'] || '';
  const headers = request.headers;
  
  try {
    const link = await prisma.linkVariant.findUnique({
      where: { slug },
      include: { influencer: true }
    });
    
    if (!link) return response.status(404).send('Link no encontrado');
    if (!link.isActive) return response.status(403).send('Link desactivado');
    
    const riskScore = calculateRiskScore(headers, bot);
    const isBotDetected = riskScore >= 50 || isBot(bot);
    
    console.log(`[${new Date().toISOString()}] Slug: ${slug}, Risk: ${riskScore}, IsBot: ${isBotDetected}`);
    
    try {
      await redis.lpush(`analytics:${link.id}`, JSON.stringify({
        timestamp: new Date().toISOString(),
        bot: bot.substring(0, 200),
        ip: request.ip,
        riskScore,
        isBot: isBotDetected
      }));
    } catch (e) {}
    
    // Si es BOT → Mostrar contenido semántico
    if (isBotDetected) {
      console.log(`🤖 BOT DETECTADO - Mostrando contenido semántico: ${slug}`);
      
      const linkData = {
        slug: link.slug,
        title: link.influencer?.nombre || 'Explorando Nuevas Perspectivas',
        description: link.influencer?.categoria || 'Contenido exclusivo',
        category: link.influencer?.categoria?.toLowerCase() || 'lifestyle',
        image: '/assets/hero-1.jpg',
        author: link.influencer?.nombre || 'Content Creator'
      };
      
      const semanticHTML = generateSemanticHTML(linkData, bot);
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('X-Robots-Tag', 'index, follow');
      return response.send(semanticHTML);
    }
    
    // HUMANO desde Instagram/FB app → Forzar navegador externo
    const destino = link.influencer?.urlDestino;
    if (!destino) {
      return response.status(500).send('Error: URL de destino no configurada');
    }
    
    const ua = bot.toLowerCase();
    const isInstagram = ua.includes('instagram');
    const isFBApp = ua.includes('fb_iab') || ua.includes('fb_an');
    
    if (isInstagram || isFBApp) {
      console.log(`📱 APP - Forzando navegador externo: ${slug}`);
      
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Abriendo...</title>
<script>
(function() {
  const destino = "${destino.replace(/"/g, '&quot;')}";
  const ua = navigator.bot.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) {
    window.location.replace("instagram://extbrowser/?url=" + encodeURIComponent(destino));
  } else if (/android/.test(ua)) {
    const url = destino.replace(/^https?:\\/\\//, '');
    window.location.replace("intent://" + url + "#Intent;package=com.android.chrome;scheme=https;end");
  }
  setTimeout(function() { window.location.replace(destino); }, 2000);
})();
</script>
<style>
body{font-family:system-ui;text-align:center;padding:40px 20px;background:#f5f5f5}
.box{max-width:400px;margin:0 auto;background:white;padding:30px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
.spinner{width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="box">
  <div class="spinner"></div>
  <p>Abriendo en navegador externo...</p>
</div>
</body>
</html>`;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      return response.send(html);
    }
    
    // HUMANO normal → Redirección directa
    console.log(`👤 HUMANO - Redirigiendo a: ${destino}`);
    setTimeout(() => {
      response.setHeader('Location', destino);
      response.status(302).send();
    }, Math.random() * 100 + 50);
    
  } catch (error) {
    console.error('Error:', error);
    response.status(500).send('Error interno: ' + error.message);
  }
});

// Health check
app.get('/health', (request, response) => {
  response.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT)
  .then(() => console.log(`🚀 Servidor en puerto ${PORT} | 🤖 Bot detection: ON | 🛡️  Security: ON`))
  .catch((error) => console.error('Error:', error));
