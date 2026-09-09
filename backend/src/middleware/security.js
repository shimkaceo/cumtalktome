import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Middleware: Verificar si IP está en lista negra
export async function checkBlacklist(request, response, next) {
  const ip = request.ip;
  
  try {
    const isBlacklisted = await redis.exists(`blacklist:${ip}`);
    
    if (isBlacklisted) {
      console.log(`🚫 IP BLOQUEADA: ${ip}`);
      return response.status(403).send('Acceso temporalmente restringido');
    }
    
    // IP limpia, continuar
    next();
  } catch (error) {
    console.error('Error checking blacklist:', error);
    // En caso de error, permitir acceso (fail open)
    next();
  }
}

// Middleware: Registrar acceso sospechoso (para análisis posterior)
export async function logAccess(request, response, next) {
  const ip = request.ip;
  const userAgent = request.headers['user-agent'] || 'unknown';
  const path = request.path;
  
  // Solo logear ciertos patrones sospechosos
  const suspiciousPatterns = ['/api/', '/admin/', '/.env', '/config'];
  const isSuspicious = suspiciousPatterns.some(p => path.includes(p));
  
  if (isSuspicious) {
    console.log(`⚠️  Acceso sospechoso: ${ip} → ${path}`);
  }
  
  next();
}
