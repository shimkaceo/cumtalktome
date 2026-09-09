import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const WINDOW_MS = 60000; // 1 minuto
const MAX_REQUESTS = 10; // máximo 10 requests por minuto

export function rateLimit(request, response, next) {
  const ip = request.ip;
  const key = `ratelimit:${ip}`;
  
  redis.get(key).then((current) => {
    if (current && parseInt(current) >= MAX_REQUESTS) {
      console.log(`⛔ RATE LIMIT: ${ip} bloqueado`);
      return response.status(429).send('Demasiadas peticiones');
    }
    
    // Incrementar contador
    redis.multi()
      .incr(key)
      .expire(key, WINDOW_MS / 1000)
      .exec()
      .then(() => next())
      .catch(() => next());
  }).catch(() => next());
}
