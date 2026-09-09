import HyperExpress from 'hyper-express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import cluster from 'cluster';
import os from 'os';
import dotenv from 'dotenv';
import { securityHeaders } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import linksRouter from './routes/links.js';
import analyticsRouter from './routes/analytics.js';
import adminRouter from './routes/admin.js';
import { generateSemanticContent } from './services/contentGenerator.js';

dotenv.config();

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
});

const app = new HyperExpress.Server({
  max_body_length: 1024 * 1024,
  auto_close: true,
});

app.use(securityHeaders);
app.use(rateLimit(redis));

app.get('/health', async (req, res) => {
  const dbStatus = await prisma.$queryRaw`SELECT 1`.then(() => 'ok').catch(() => 'error');
  const redisStatus = redis.status === 'ready' ? 'ok' : 'error';
  
  res.json({
    status: dbStatus === 'ok' && redisStatus === 'ok' ? 'healthy' : 'unhealthy',
    database: dbStatus,
    cache: redisStatus,
    timestamp: new Date().toISOString(),
  });
});

app.get('/:slug', async (req, res) => {
  const startTime = Date.now();
  const { slug } = req.params;
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const userAgent = req.headers['user-agent'] || '';
  
  try {
    const cacheKey = `ip:class:${ip}`;
    let riskScore = await redis.get(cacheKey);
    
    if (!riskScore) {
      const headers = req.headers;
      riskScore = calculateRiskScore(headers, userAgent, ip);
      await redis.setex(cacheKey, 300, riskScore);
    } else {
      riskScore = parseInt(riskScore);
    }
    
    const variant = await prisma.linkVariant.findUnique({
      where: { slug, isActive: true },
      include: { influencer: true },
    });
    
    if (!variant) {
      return res.status(404).send('Not found');
    }
    
    logAccess(prisma, variant, ip, userAgent, riskScore, req.headers.referer);
    
    if (riskScore >= 30) {
      const html = generateUserRedirect(variant.influencer.urlDestino, variant.influencer.categoria);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(html);
    } else {
      const content = await generateSemanticContent(variant.influencer);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.send(content);
    }
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal server error');
  }
});

app.use('/api/links', linksRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/admin', adminRouter);

const PORT = process.env.PORT || 3000;

if (cluster.isPrimary && process.env.CLUSTER_MODE !== 'false') {
  const numCPUs = os.cpus().length;
  console.log(`Master ${process.pid} iniciando ${numCPUs} workers...`);
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} murió, reiniciando...`);
    cluster.fork();
  });
} else {
  app.listen(PORT)
    .then(() => console.log(`Worker ${process.pid} escuchando en puerto ${PORT}`))
    .catch((err) => console.error('Error al iniciar:', err));
}

function calculateRiskScore(headers, userAgent, ip) {
  let score = 50;
  
  const suspiciousHeaders = ['x-bot', 'x-crawler', 'x-scraper'];
  for (const h of suspiciousHeaders) {
    if (headers[h.toLowerCase()]) score -= 20;
  }
  
  if (headers['accept-language']) score += 10;
  if (headers['sec-fetch-site']) score += 10;
  if (headers['sec-ch-ua']) score += 15;
  
  if (!userAgent || userAgent.includes('bot') || userAgent.includes('crawler')) {
    score -= 30;
  }
  
  return Math.max(0, Math.min(100, score));
}

function generateUserRedirect(urlDestino, categoria) {
  const appSchemes = {
    FOTOGRAFIA: ['instagram://', 'vsco://'],
    ARTE: ['behance://', 'dribbble://'],
    LIFESTYLE: ['instagram://', 'tiktok://'],
    MODA: ['instagram://', 'pinterest://'],
    FITNESS: ['instagram://', 'strava://'],
    MUSICA: ['spotify://', 'applemusic://'],
    OTROS: ['https://']
  };
  
  const schemes = appSchemes[categoria] || appSchemes.OTROS;
  
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redireccionando...</title>
  <meta http-equiv="refresh" content="0; url=${urlDestino}">
  <script>
    (function() {
      const schemes = ${JSON.stringify(schemes)};
      const destino = "${urlDestino}";
      
      schemes.forEach((scheme, i) => {
        setTimeout(() => {
          if (scheme.startsWith('http')) {
            window.location.replace(destino);
          } else {
            window.location.href = scheme;
          }
        }, i * 100);
      });
      
      setTimeout(() => {
        window.location.replace(destino);
      }, 1500);
    })();
  </script>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #000; color: #fff; }
    .loader { text-align: center; }
    .spinner { width: 40px; height: 40px; border: 3px solid #333; border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Abriendo contenido...</p>
    <p style="font-size: 12px; opacity: 0.6;">Si no redirige automáticamente, <a href="${urlDestino}" style="color: #fff;">haz clic aquí</a></p>
  </div>
</body>
</html>`;
}

async function logAccess(prisma, variant, ip, userAgent, riskScore, referrer) {
  try {
    await prisma.linkVariant.update({
      where: { id: variant.id },
      data: { clickCount: { increment: 1 } },
    });
    
    await prisma.accessLog.create({
      data: {
        variantId: variant.id,
        influencerId: variant.influencerId,
        ipAddress: ip,
        userAgent: userAgent?.substring(0, 500),
        riskScore: riskScore,
        isBot: riskScore < 30,
        referrer: referrer?.substring(0, 500),
      },
    });
  } catch (e) {
    console.error('Error logging access:', e);
  }
}

export { prisma, redis };
