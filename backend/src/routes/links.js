import { Router } from 'hyper-express';
import { prisma } from '../server.js';
import { nanoid } from 'nanoid';
import { authenticate } from '../middleware/auth.js';

const router = new Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const influencers = await prisma.influencer.findMany({
      include: {
        linkVariants: {
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { 
            linkVariants: true,
            analytics: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(influencers);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const body = await req.json();
    const { nombre, urlDestino, categoria } = body;
    
    if (!nombre || !urlDestino || !categoria) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
      new URL(urlDestino);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    
    const influencer = await prisma.influencer.create({
      data: { nombre, urlDestino, categoria }
    });
    
    const variants = [];
    const baseSlug = nombre.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    for (let i = 0; i < 12; i++) {
      const randomCode = nanoid(4).toLowerCase().replace(/[^a-z0-9]/g, '');
      const slug = i === 0 ? baseSlug : `${baseSlug}-${randomCode}`;
      
      try {
        const variant = await prisma.linkVariant.create({
          data: { influencerId: influencer.id, slug }
        });
        variants.push(variant);
      } catch (e) {}
    }
    
    res.status(201).json({
      influencer,
      variants,
      totalGenerated: variants.length
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/variants', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const variants = await prisma.linkVariant.findMany({
      where: { influencerId: id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(variants);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/regenerate', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const influencer = await prisma.influencer.findUnique({ where: { id } });
    
    if (!influencer) {
      return res.status(404).json({ error: 'Influencer not found' });
    }
    
    await prisma.linkVariant.updateMany({
      where: { influencerId: id },
      data: { isActive: false }
    });
    
    const variants = [];
    const baseSlug = influencer.nombre.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    for (let i = 0; i < 12; i++) {
      const randomCode = nanoid(4).toLowerCase().replace(/[^a-z0-9]/g, '');
      const slug = `${baseSlug}-${randomCode}`;
      
      try {
        const variant = await prisma.linkVariant.create({
          data: { influencerId: id, slug, isActive: true }
        });
        variants.push(variant);
      } catch (e) {}
    }
    
    res.json({ message: 'Variants regenerated', variants, totalGenerated: variants.length });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.influencer.delete({ where: { id } });
    res.json({ message: 'Influencer deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
