import { Router } from 'hyper-express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../server.js';

const router = new Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES = '24h';

router.post('/login', async (req, res) => {
  try {
    const body = await req.json();
    const { username, password } = body;
    
    const user = await prisma.adminUser.findUnique({
      where: { username }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });
    
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/setup', async (req, res) => {
  try {
    const existingAdmin = await prisma.adminUser.findFirst();
    
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin already exists' });
    }
    
    const body = await req.json();
    const { username, password } = body;
    
    if (!username || !password || password.length < 8) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.adminUser.create({
      data: {
        username,
        password: hashedPassword
      }
    });
    
    res.status(201).json({
      message: 'Admin user created',
      username: user.username
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
