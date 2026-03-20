import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authenticate';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateAccessToken(id: string, email: string): string {
  return jwt.sign({ id, email }, process.env.ACCESS_TOKEN_SECRET as string, {
    expiresIn: '15m',
  });
}

function generateRefreshToken(id: string, email: string): string {
  return jwt.sign({ id, email }, process.env.REFRESH_TOKEN_SECRET as string, {
    expiresIn: '7d',
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  // Check for existing user
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: 'Email already registered' });
    return;
  }

  // Hash and save
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.create({
    data: { email, password: hashedPassword },
  });

  res.status(201).json({ message: 'User registered successfully' });
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Generate tokens
  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id, user.email);

  // Persist refresh token
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  res.status(200).json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email },
  });
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(401).json({ error: 'Refresh token required' });
    return;
  }

  try {
    // Verify signature
    const payload = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET as string
    ) as { id: string; email: string };

    // Check it matches what's stored
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || user.refreshToken !== refreshToken) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const newAccessToken = generateAccessToken(user.id, user.email);
    res.status(200).json({ accessToken: newAccessToken });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.id;

  // Clear stored refresh token
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });

  res.status(200).json({ message: 'Logged out successfully' });
}
