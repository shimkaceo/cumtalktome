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
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=${variant.influencer.urlDestino}">
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
