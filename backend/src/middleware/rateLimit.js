export function rateLimit(redis) {
  return async (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `ratelimit:${ip}`;
    
    try {
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.expire(key, 60);
      }
      
      if (current > 100) {
        return res.status(429).json({ 
          error: 'Too many requests',
          retryAfter: await redis.ttl(key)
        });
      }
      
      res.setHeader('X-RateLimit-Limit', '100');
      res.setHeader('X-RateLimit-Remaining', Math.max(0, 100 - current));
      
      return next();
      
    } catch (error) {
      return next();
    }
  };
}
