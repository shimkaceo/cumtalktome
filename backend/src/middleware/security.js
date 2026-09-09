import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export function checkBlacklist(request, response, next) {
  const ip = request.ip;
  
  redis.exists(`blacklist:${ip}`).then((isBlacklisted) => {
    if (isBlacklisted) {
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
