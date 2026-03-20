import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authenticate';

const prisma = new PrismaClient();

// Use a plain TypeScript type instead of Prisma enum (SQLite doesn't support enums)
type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';

// Status toggle cycle: PENDING → IN_PROGRESS → DONE → PENDING
const STATUS_CYCLE: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'DONE'];

// ─── GET /tasks ───────────────────────────────────────────────────────────────

export async function getTasks(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.id;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 10));
  const status = req.query.status as TaskStatus | undefined;
  const search = req.query.search as string | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { userId };

  if (status && STATUS_CYCLE.includes(status)) {
    where.status = status;
  }

  if (search && search.trim()) {
    // SQLite: use plain contains (no 'mode' option — SQLite is case-insensitive by default for ASCII)
    where.title = { contains: search.trim() };
  }

  const total = await prisma.task.count({ where });

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  res.status(200).json({
    tasks,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

// ─── POST /tasks ──────────────────────────────────────────────────────────────

export async function createTask(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { title, description, status } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  if (status && !STATUS_CYCLE.includes(status)) {
    res.status(400).json({ error: 'Invalid status value' });
    return;
  }

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      status: status || 'PENDING',
      userId,
    },
  });

  res.status(201).json(task);
}

// ─── GET /tasks/:id ───────────────────────────────────────────────────────────

export async function getTask(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { id } = req.params;

  const task = await prisma.task.findFirst({ where: { id, userId } });

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.status(200).json(task);
}

// ─── PATCH /tasks/:id ─────────────────────────────────────────────────────────

export async function updateTask(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { id } = req.params;
  const { title, description, status } = req.body;

  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (status && !STATUS_CYCLE.includes(status)) {
    res.status(400).json({ error: 'Invalid status value' });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (title !== undefined) {
    if (!title.trim()) { res.status(400).json({ error: 'Title cannot be empty' }); return; }
    data.title = title.trim();
  }
  if (description !== undefined) data.description = description?.trim() || null;
  if (status !== undefined) data.status = status;

  const task = await prisma.task.update({ where: { id }, data });
  res.status(200).json(task);
}

// ─── DELETE /tasks/:id ────────────────────────────────────────────────────────

export async function deleteTask(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { id } = req.params;

  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  await prisma.task.delete({ where: { id } });
  res.status(200).json({ message: 'Task deleted' });
}

// ─── PATCH /tasks/:id/toggle ──────────────────────────────────────────────────

export async function toggleTask(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { id } = req.params;

  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const currentIndex = STATUS_CYCLE.indexOf(existing.status as TaskStatus);
  const nextStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];

  const task = await prisma.task.update({
    where: { id },
    data: { status: nextStatus },
  });

  res.status(200).json(task);
}
