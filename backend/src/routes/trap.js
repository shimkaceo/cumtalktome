import { Router } from 'hyper-express';
import Redis from 'ioredis';

const router = new Router();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Endpoint honeypot - enlaces invisibles apuntan aquí
router.get('/trap', async (request, response) => {
  const ip = request.ip;
  const userAgent = request.headers['user-agent'] || 'unknown';
  
  console.log(`🚨 HONEYPOT ACTIVADO - IP: ${ip}, UA: ${userAgent.substring(0, 50)}`);
  
  // Guardar IP en lista negra por 24 horas (86400 segundos)
  await redis.setex(`blacklist:${ip}`, 86400, JSON.stringify({
    timestamp: new Date().toISOString(),
    userAgent: userAgent,
    reason: 'honeypot_triggered'
  }));
  
  // Devolver 404 para que parezca un error normal
  response.status(404).send('Not found');
});

export default router;
