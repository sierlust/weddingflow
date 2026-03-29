// Repository for wedding task checklist items.
// Uses in-memory store (falls back when no PostgreSQL is configured).

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskSource = 'manual' | 'auto_suggestion';

export type TaskRecord = {
    id: string;
    weddingId: string;
    title: string;
    deadline?: string;
    assignedSupplierOrgId?: string;
    priority: TaskPriority;
    completed: boolean;
    source: TaskSource;
    sourcePhase?: string;
    createdAt: string;
    updatedAt: string;
};

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const tasksStore = new Map<string, TaskRecord>();

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function findTasksByWedding(weddingId: string): Promise<TaskRecord[]> {
    return Array.from(tasksStore.values())
        .filter(t => t.weddingId === weddingId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findTaskById(id: string): Promise<TaskRecord | null> {
    return tasksStore.get(id) ?? null;
}

export async function createTask(task: TaskRecord): Promise<TaskRecord> {
    tasksStore.set(task.id, { ...task });
    return { ...task };
}

export async function updateTask(id: string, patch: Partial<TaskRecord>): Promise<TaskRecord | null> {
    const existing = tasksStore.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    tasksStore.set(id, updated);
    return { ...updated };
}

export async function removeTask(id: string): Promise<boolean> {
    return tasksStore.delete(id);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearTasksStoreForTests(): void {
    tasksStore.clear();
}
