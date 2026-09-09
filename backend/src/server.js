import HyperExpress from 'hyper-express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

dotenv.config();

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const app = new HyperExpress.Server();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const templates = {
  FOTOGRAFIA: {
    titles: ['Capturando Momentos: El Arte de la Fotografía Contemporánea', 'Luz y Sombra: Explorando la Fotografía Artística'],
    paragraphs: ['La fotografía es el arte de preservar emociones y transformar lo ordinario en extraordinario.', 'Cada imagen cuenta una historia única, reflejando la visión del artista.'],
    tags: ['fotografía', 'arte visual', 'creatividad']
  },
  ARTE: {
    titles: ['Expresión Creativa: El Poder del Arte Visual', 'Colores y Formas: Explorando la Creatividad'],
    paragraphs: ['El arte es el lenguaje universal que trasciende fronteras.', 'La creatividad no conoce límites ni barreras.'],
    tags: ['arte', 'creatividad', 'diseño']
  },
  LIFESTYLE: {
    titles: ['Vida con Propósito: Estilo y Bienestar', 'Momentos Cotidianos: Encontrando la Belleza'],
    paragraphs: ['La verdadera riqueza está en los momentos que valoramos.', 'Cada día ofrece oportunidades para crecer.'],
    tags: ['lifestyle', 'bienestar', 'inspiración']
  },
  MODA: {
    titles: ['Estilo Personal: Más Allá de las Tendencias', 'Moda como Expresión: Tu Firma Visual'],
    paragraphs: ['La moda es un lenguaje silencioso que comunica quiénes somos.', 'El estilo personal es una declaración de autenticidad.'],
    tags: ['moda', 'estilo', 'tendencias']
  },
  FITNESS: {
    titles: ['Movimiento como Medicina: Fitness Holístico', 'Fortaleza Interior: Más Allá del Físico'],
    paragraphs: ['El movimiento es vida y energía.', 'La disciplina transforma cuerpo y mente.'],
    tags: ['fitness', 'salud', 'bienestar']
  },
  MUSICA: {
    titles: ['Sonidos del Alma: El Poder de la Música', 'Ritmo y Emoción: Explorando el Universo Musical'],
    paragraphs: ['La música conecta corazones a través del tiempo.', 'La melodía es el lenguaje de las emociones.'],
    tags: ['música', 'creatividad', 'arte sonoro']
  },
  OTROS: {
    titles: ['Explorando Nuevas Perspectivas', 'Creatividad Sin Límites'],
    paragraphs: ['El contenido creativo nos invita a ver el mundo con ojos nuevos.', 'Explorar, crear y compartir son acciones fundamentales.'],
    tags: ['creatividad', 'contenido', 'inspiración']
  }
};

function generateSemanticContent(categoria) {
  const template = templates[categoria] || templates.FOTOGRAFIA;
  const title = template.titles[Math.floor(Math.random() * template.titles.length)];
  const paragraphs = template.paragraphs.sort(() => 0.5 - Math.random()).slice(0, 2);
  const imageId = Math.random().toString(36).substring(7);
  
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${paragraphs[0]}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${paragraphs[0]}">
  <meta property="og:image" content="https://picsum.photos/seed/${imageId}/1200/630">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #333; background: #fafafa; }
    article { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { color: #111; margin-bottom: 16px; line-height: 1.3; }
    .meta { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    img { width: 100%; height: 400px; object-fit: cover; border-radius: 8px; margin: 20px 0; }
    p { margin-bottom: 20px; font-size: 17px; line-height: 1.8; color: #374151; }
    .tags { margin-top: 30px; display: flex; gap: 8px; flex-wrap: wrap; }
    .tag { background: #f3f4f6; padding: 6px 14px; border-radius: 20px; font-size: 13px; color: #6b7280; }
    footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 14px; }
    @media (max-width: 640px) { article { padding: 24px; } img { height: 250px; } }
  </style>
</head>
<body>
  <article>
    <h1>${title}</h1>
    <div class="meta">${new Date().toLocaleDateString('es-ES')} · Lectura de 3 min</div>
    <img src="https://picsum.photos/seed/${imageId}/800/500" alt="${title}" loading="lazy">
    ${paragraphs.map(p => `<p>${p}</p>`).join('')}
    <div class="tags">${template.tags.map(t => `<span class="tag">#${t}</span>`).join(' ')}</div>
  </article>
  <footer>
    <p>© ${new Date().getFullYear()} Creative Blog</p>
  </footer>
</body>
</html>`;
}

function calculateRiskScore(headers, userAgent) {
  let score = 50;
  
  if (headers['accept-language']) score += 10;
  if (headers['sec-fetch-site']) score += 10;
  if (headers['sec-ch-ua']) score += 15;
  if (headers['sec-fetch-dest']) score += 5;
  
  const ua = (userAgent || '').toLowerCase();
  if (!ua) {
    score -= 30;
  } else if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider') || 
             ua.includes('facebook') || ua.includes('googlebot') || ua.includes('instagram') ||
             ua.includes('twitter') || ua.includes('whatsapp') || ua.includes('telegram')) {
    score -= 40;
  } else if (ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari') || ua.includes('edge')) {
    score += 10;
  }
  
  return Math.max(0, Math.min(100, score));
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.send('');
  next();
});

async function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const userAgent = req.headers['user-agent'] || '';
  
  try {
    const variant = await prisma.linkVariant.findUnique({
      where: { slug, isActive: true },
      include: { influencer: true }
    });
    
    if (!variant) return res.status(404).send('Not found');
    
    await prisma.linkVariant.update({
      where: { id: variant.id },
      data: { clickCount: { increment: 1 } }
    });
    
    const riskScore = calculateRiskScore(req.headers, userAgent);
    
    if (riskScore < 30) {
      const content = generateSemanticContent(variant.influencer.categoria);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(content);
    }
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=${variant.influencer.urlDestino}">
  <script>window.location.replace("${variant.influencer.urlDestino}");</script>
</head>
<body>
  <p>Redireccionando...</p>
</body>
</html>`);
    
  } catch (e) {
    res.status(500).send('Error');
  }
});

app.post('/api/links', auth, async (req, res) => {
  try {
    const body = await req.json();
    const { nombre, urlDestino, categoria } = body;
    const influencer = await prisma.influencer.create({
      data: { nombre, urlDestino, categoria }
    });
    const variants = [];
    const base = nombre.toLowerCase().replace(/[^a-z0-9]/g, '-');
    for (let i = 0; i < 10; i++) {
      const code = nanoid(4).toLowerCase();
      const slug = i === 0 ? base : `${base}-${code}`;
      try {
        const v = await prisma.linkVariant.create({
          data: { influencerId: influencer.id, slug }
        });
        variants.push(v);
      } catch (e) {}
    }
    res.status(201).json({ influencer, variants, totalGenerated: variants.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/links', auth, async (req, res) => {
  const influencers = await prisma.influencer.findMany({
    include: { linkVariants: true }
  });
  res.json(influencers);
});

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = await req.json();
  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.post('/api/admin/setup', async (req, res) => {
  const existing = await prisma.adminUser.findFirst();
  if (existing) return res.status(400).json({ error: 'Admin already exists' });
  const { username, password } = await req.json();
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.adminUser.create({
    data: { username, password: hashed }
  });
  res.json({ message: 'Admin created', username: user.username });
});

app.get('/health', async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0')
  .then(() => console.log(`Server running on port ${PORT}`))
  .catch(console.error);
