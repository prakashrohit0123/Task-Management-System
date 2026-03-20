'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchWithAuth,
  clearTokens,
  getUserEmail,
  getAccessToken,
  getRefreshToken,
} from '@/lib/auth';
import { useToast } from '@/components/Toast';
import styles from './dashboard.module.css';

const API = process.env.NEXT_PUBLIC_API_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'PENDING' | 'IN_PROGRESS' | 'DONE';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

interface TasksResponse {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface TaskFormData {
  title: string;
  description: string;
  status: Status;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Status, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
];

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Task Form ────────────────────────────────────────────────────────────────

function TaskForm({
  initial,
  onSubmit,
  loading,
}: {
  initial?: TaskFormData;
  onSubmit: (data: TaskFormData) => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [status, setStatus] = useState<Status>(initial?.status || 'PENDING');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ title, description, status });
  }

  return (
    <form onSubmit={handleSubmit} className={styles.taskForm}>
      <div className={styles.field}>
        <label htmlFor="task-title">
          Title <span className={styles.req}>*</span>
        </label>
        <input
          id="task-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="What needs to be done?"
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="task-desc">Description</label>
        <textarea
          id="task-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional details…"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="task-status">Status</label>
        <select
          id="task-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
        >
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="DONE">Done</option>
        </select>
      </div>

      <div className={styles.formActions}>
        <button type="submit" className={styles.btnPrimary} disabled={loading}>
          {loading ? 'Saving…' : initial ? 'Update Task' : 'Create Task'}
        </button>
      </div>
    </form>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onEdit,
  onDelete,
  onToggle,
}: {
  task: Task;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const date = new Date(task.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={`${styles.badge} ${styles[`badge_${task.status}`]}`}>
          {STATUS_LABELS[task.status]}
        </span>
        <span className={styles.cardDate}>{date}</span>
      </div>

      <h3 className={styles.cardTitle}>{task.title}</h3>

      {task.description && (
        <p className={styles.cardDesc}>{task.description}</p>
      )}

      <div className={styles.cardActions}>
        <button
          className={styles.btnToggle}
          onClick={() => onToggle(task.id)}
          title="Advance to next status"
        >
          ↻ Next Status
        </button>
        <button
          className={styles.btnEdit}
          onClick={() => onEdit(task)}
          title="Edit this task"
        >
          Edit
        </button>
        <button
          className={styles.btnDelete}
          onClick={() => onDelete(task.id)}
          title="Delete this task"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filter/search state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // UI state
  const [userEmail, setUserEmailState] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const hasAuth = getAccessToken() || getRefreshToken();
    if (!hasAuth) {
      router.replace('/login');
      return;
    }
    setUserEmailState(getUserEmail() || '');
  }, [router]);

  // ── Fetch tasks ──────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(
    async (p = 1, s = search, sf = statusFilter) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), limit: '9' });
        if (s.trim()) params.set('search', s.trim());
        if (sf) params.set('status', sf);

        const res = await fetchWithAuth(`${API}/tasks?${params}`);

        if (res.status === 401) {
          clearTokens();
          router.replace('/login');
          return;
        }

        if (!res.ok) {
          showToast('Failed to load tasks', 'error');
          return;
        }

        const data: TasksResponse = await res.json();
        setTasks(data.tasks);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setPage(data.page);
      } catch {
        showToast('Network error — is the backend running?', 'error');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, showToast]
  );

  // Initial fetch
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ── Search with debounce ──────────────────────────────────────────────────────
  function handleSearchChange(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchTasks(1, val, statusFilter);
    }, 400);
  }

  function handleStatusChange(val: string) {
    setStatusFilter(val);
    fetchTasks(1, search, val);
  }

  // ── CRUD operations ──────────────────────────────────────────────────────────

  async function handleCreate(data: TaskFormData) {
    setFormLoading(true);
    try {
      const res = await fetchWithAuth(`${API}/tasks`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || 'Failed to create task', 'error');
        return;
      }
      showToast('Task created!', 'success');
      setShowAdd(false);
      fetchTasks(1, search, statusFilter);
    } catch {
      showToast('Network error', 'error');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleUpdate(data: TaskFormData) {
    if (!editTask) return;
    setFormLoading(true);
    try {
      const res = await fetchWithAuth(`${API}/tasks/${editTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || 'Failed to update task', 'error');
        return;
      }
      showToast('Task updated!', 'success');
      setEditTask(null);
      fetchTasks(page, search, statusFilter);
    } catch {
      showToast('Network error', 'error');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      const res = await fetchWithAuth(`${API}/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('Failed to delete task', 'error');
        return;
      }
      showToast('Task deleted!', 'success');
      // If this was the last item on a non-first page, go back one page
      const newPage = tasks.length === 1 && page > 1 ? page - 1 : page;
      fetchTasks(newPage, search, statusFilter);
    } catch {
      showToast('Network error', 'error');
    }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetchWithAuth(`${API}/tasks/${id}/toggle`, { method: 'PATCH' });
      if (!res.ok) {
        showToast('Failed to update status', 'error');
        return;
      }
      const updated: Task = await res.json();
      // Update in-place for instant feedback
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      showToast('Status updated!', 'success');
    } catch {
      showToast('Network error', 'error');
    }
  }

  async function handleLogout() {
    try {
      await fetchWithAuth(`${API}/auth/logout`, { method: 'POST' });
    } finally {
      clearTokens();
      router.replace('/login');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <span className={styles.logoIcon}>✓</span>
            <h1 className={styles.logo}>TaskApp</h1>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.userEmail}>{userEmail}</span>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className={styles.main}>
        {/* Controls row */}
        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search tasks by title…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Search tasks"
            />
          </div>

          <select
            className={styles.select}
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
            + New Task
          </button>
        </div>

        {/* Result count */}
        <p className={styles.meta}>
          {loading
            ? 'Loading…'
            : `${total} task${total !== 1 ? 's' : ''}${search || statusFilter ? ' found' : ''}`}
        </p>

        {/* Task Grid */}
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading tasks…</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyIcon}>📋</p>
            <p className={styles.emptyTitle}>No tasks found</p>
            {!search && !statusFilter && (
              <p className={styles.emptyHint}>
                Click <strong>+ New Task</strong> to create your first task.
              </p>
            )}
            {(search || statusFilter) && (
              <p className={styles.emptyHint}>Try adjusting your search or filter.</p>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={setEditTask}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && !loading && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              onClick={() => fetchTasks(page - 1, search, statusFilter)}
              disabled={page <= 1}
            >
              ← Previous
            </button>
            <span className={styles.pageInfo}>
              Page {page} of {totalPages}
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => fetchTasks(page + 1, search, statusFilter)}
              disabled={page >= totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </main>

      {/* ── Add Modal ── */}
      {showAdd && (
        <Modal title="New Task" onClose={() => setShowAdd(false)}>
          <TaskForm onSubmit={handleCreate} loading={formLoading} />
        </Modal>
      )}

      {/* ── Edit Modal ── */}
      {editTask && (
        <Modal title="Edit Task" onClose={() => setEditTask(null)}>
          <TaskForm
            initial={{
              title: editTask.title,
              description: editTask.description || '',
              status: editTask.status,
            }}
            onSubmit={handleUpdate}
            loading={formLoading}
          />
        </Modal>
      )}
    </div>
  );
}
