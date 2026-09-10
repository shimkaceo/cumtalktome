import Redis from 'ioredis';
import { isBot } from '../utils/botDetection.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
// Ver server.js: sin listener, un Redis caido satura el log de reintentos
redis.on('error', (error) => console.error('Redis:', error.message));

export function checkBlacklist(request, response, next) {
  const ip = request.ip;
  
  redis.exists(`blacklist:${ip}`).then((isBlacklisted) => {
    if (isBlacklisted) {
      // Un bot cuya IP cayo en el honeypot recibe el mismo 302 a Wikipedia
      // que cualquier otro bot: nunca un 403 que delate el bloqueo. Solo
      // los humanos baneados ven el mensaje de acceso restringido.
      if (isBot(request.headers['user-agent'] || '')) {
        return response.redirect('https://en.wikipedia.org/wiki/Shinka');
      }
      console.log(`IP BLOQUEADA: ${ip}`);
      return response.status(403).send('Acceso temporalmente restringido');
    }
    next();
  }).catch((error) => {
    console.error('Error checking blacklist:', error);
    next();
  });
}

export function logAccess(request, response, next) {
  const ip = request.ip;
  const path = request.path;
  
  const suspiciousPatterns = ['/api/', '/admin/', '/.env', '/config'];
  const isSuspicious = suspiciousPatterns.some(p => path.includes(p));
  
  if (isSuspicious) {
    console.log(`Acceso sospechoso: ${ip} -> ${path}`);
  }
  
  next();
}
