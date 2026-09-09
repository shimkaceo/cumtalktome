import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Generar token único
export async function generateToken(ip, userAgent) {
  const token = randomUUID();
  const data = {
    ip,
    userAgent: userAgent.substring(0, 200),
    createdAt: new Date().toISOString()
  };
  
  // Guardar por 5 minutos (300 segundos)
  await redis.setex(`token:${token}`, 300, JSON.stringify(data));
  return token;
}

// Validar token
export async function validateToken(token, ip) {
  if (!token) return false;
  
  const data = await redis.get(`token:${token}`);
  if (!data) return false;
  
  const parsed = JSON.parse(data);
  
  // Verificar que la IP coincide (protección básica)
  if (parsed.ip !== ip) {
    console.log(`⚠️  Token IP mismatch: ${ip} vs ${parsed.ip}`);
    return false;
  }
  
  return true;
}
