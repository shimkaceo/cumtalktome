import HyperExpress from 'hyper-express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { generateSemanticHTML } from './utils/contentGenerator.js';

const app = new HyperExpress.Server();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const botUserAgents = ['facebookexternalhit','facebot','googlebot','bingbot','twitterbot','linkedinbot','whatsapp','telegrambot','slackbot','discordbot','applebot','yandexbot','baiduspider','rogerbot','embedly','quora link preview'];

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

app.get('/:slug', async (request, response) => {
  const slug = request.params.slug;
  const userAgent = request.headers['user-agent'] || '';
  const headers = request.headers;
  
  try {
    // CORREGIDO: linkVariant (no link)
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
    
    if (isBotDetected) {
      console.log(`🤖 BOT DETECTADO - Mostrando contenido semántico: ${slug}`);
      const linkData = {
        slug: link.slug,
        title: link.title,
        description: link.description,
        category: link.category || 'lifestyle',
        image: link.image,
        author: link.influencer?.name || 'Content Creator'
      };
      const semanticHTML = generateSemanticHTML(linkData, userAgent);
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('X-Robots-Tag', 'index, follow');
      return response.send(semanticHTML);
    }
    
    console.log(`👤 HUMANO - Redirigiendo a: ${link.targetUrl}`);
    setTimeout(() => {
      response.setHeader('Location', link.targetUrl || 'https://onlyfans.com');
      response.status(302).send();
    }, Math.random() * 100 + 50);
    
  } catch (error) {
    console.error('Error:', error);
    response.status(500).send('Error interno: ' + error.message);
  }
});

app.get('/health', (request, response) => {
  response.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT)
  .then(() => console.log(`🚀 Servidor en puerto ${PORT} | 🤖 Bot detection: ON`))
  .catch((error) => console.error('Error:', error));
