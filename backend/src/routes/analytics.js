import { Router } from 'hyper-express';
import { prisma } from '../server.js';
import { authenticate } from '../middleware/auth.js';

const router = new Router();

router.get('/:slug', authenticate, async (req, res) => {
  try {
    const { slug } = req.params;
    
    const variant = await prisma.linkVariant.findUnique({
      where: { slug },
      include: { influencer: true }
    });
    
    if (!variant) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    const stats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_clicks,
        COUNT(DISTINCT ip_address) as unique_visitors,
        COUNT(CASE WHEN is_bot = true THEN 1 END) as bot_clicks,
        COUNT(CASE WHEN is_bot = false THEN 1 END) as human_clicks,
        AVG(risk_score) as avg_risk_score
      FROM "AccessLog"
      WHERE variant_id = ${variant.id}
    `;
    
    const byCountry = await prisma.$queryRaw`
      SELECT country, COUNT(*) as count
      FROM "AccessLog"
      WHERE variant_id = ${variant.id} AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `;
    
    const byDevice = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN user_agent LIKE '%Mobile%' THEN 'Mobile'
          WHEN user_agent LIKE '%Tablet%' THEN 'Tablet'
          ELSE 'Desktop'
        END as device_type,
        COUNT(*) as count
      FROM "AccessLog"
      WHERE variant_id = ${variant.id}
      GROUP BY device_type
    `;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const timeline = await prisma.$queryRaw`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as clicks
      FROM "AccessLog"
      WHERE variant_id = ${variant.id} 
        AND timestamp >= ${thirtyDaysAgo}
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `;
    
    res.json({
      slug: variant.slug,
      influencer: variant.influencer.nombre,
      totalClicks: variant.clickCount,
      stats: stats[0],
      byCountry,
      byDevice,
      timeline
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/influencer/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const influencer = await prisma.influencer.findUnique({
      where: { id },
      include: { linkVariants: true }
    });
    
    if (!influencer) {
      return res.status(404).json({ error: 'Influencer not found' });
    }
    
    const variantIds = influencer.linkVariants.map(v => v.id);
    
    const totalStats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_accesses,
        COUNT(DISTINCT ip_address) as unique_visitors,
        COUNT(CASE WHEN is_bot = false THEN 1 END) as human_clicks,
        COUNT(CASE WHEN is_bot = true THEN 1 END) as bot_clicks
      FROM "AccessLog"
      WHERE variant_id = ANY(${variantIds}::uuid[])
    `;
    
    const topVariants = await prisma.linkVariant.findMany({
      where: { influencerId: id },
      orderBy: { clickCount: 'desc' },
      take: 5
    });
    
    res.json({
      influencer: influencer.nombre,
      totalClicks: influencer.linkVariants.reduce((sum, v) => sum + v.clickCount, 0),
      activeVariants: influencer.linkVariants.filter(v => v.isActive).length,
      stats: totalStats[0],
      topVariants
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const totalInfluencers = await prisma.influencer.count();
    const totalLinks = await prisma.linkVariant.count();
    const totalClicks = await prisma.linkVariant.aggregate({
      _sum: { clickCount: true }
    });
    
    const recentActivity = await prisma.accessLog.findMany({
      take: 10,
      orderBy: { timestamp: 'desc' },
      include: {
        variant: {
          include: {
            influencer: true
          }
        }
      }
    });
    
    const byCategory = await prisma.$queryRaw`
      SELECT i.categoria, COUNT(*) as clicks
      FROM "AccessLog" al
      JOIN "Influencer" i ON al.influencer_id = i.id
      GROUP BY i.categoria
      ORDER BY clicks DESC
    `;
    
    res.json({
      totalInfluencers,
      totalLinks,
      totalClicks: totalClicks._sum.clickCount || 0,
      recentActivity,
      byCategory
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
