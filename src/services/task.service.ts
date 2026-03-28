export interface Task {
    id: string;
    weddingId: string;
    title: string;
    deadline?: string;
    assignedSupplierOrgId?: string;
    priority: 'high' | 'medium' | 'low';
    completed: boolean;
    source: 'manual' | 'auto_suggestion';
    sourcePhase?: string;
    createdAt: string;
    updatedAt: string;
}

export class TaskService {
    private static tasks: Map<string, Task> = new Map();

    static async getTasks(weddingId: string): Promise<Task[]> {
        return Array.from(this.tasks.values())
            .filter(t => t.weddingId === weddingId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    static async addTask(weddingId: string, data: {
        title: string;
        deadline?: string;
        assignedSupplierOrgId?: string;
        priority?: string;
        source?: string;
        sourcePhase?: string;
    }): Promise<Task> {
        if (!data.title?.trim()) throw Object.assign(new Error('Taaktitel is verplicht'), { status: 400 });
        const validPriorities = ['high', 'medium', 'low'];
        const id = `task-${Math.random().toString(36).slice(2, 10)}`;
        const task: Task = {
            id,
            weddingId,
            title: data.title.trim(),
            deadline: data.deadline || undefined,
            assignedSupplierOrgId: data.assignedSupplierOrgId?.trim() || undefined,
            priority: validPriorities.includes(data.priority || '') ? data.priority as Task['priority'] : 'medium',
            completed: false,
            source: data.source === 'auto_suggestion' ? 'auto_suggestion' : 'manual',
            sourcePhase: data.sourcePhase || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this.tasks.set(id, task);
        return task;
    }

    static async updateTask(taskId: string, patch: {
        completed?: boolean;
        title?: string;
        deadline?: string;
        priority?: string;
        assignedSupplierOrgId?: string;
    }): Promise<Task> {
        const task = this.tasks.get(taskId);
        if (!task) throw Object.assign(new Error('Taak niet gevonden'), { status: 404 });
        const validPriorities = ['high', 'medium', 'low'];
        const updated: Task = {
            ...task,
            ...(patch.completed !== undefined ? { completed: Boolean(patch.completed) } : {}),
            ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
            ...(patch.deadline !== undefined ? { deadline: patch.deadline || undefined } : {}),
            ...(patch.priority && validPriorities.includes(patch.priority) ? { priority: patch.priority as Task['priority'] } : {}),
            ...(patch.assignedSupplierOrgId !== undefined ? { assignedSupplierOrgId: patch.assignedSupplierOrgId?.trim() || undefined } : {}),
            updatedAt: new Date().toISOString(),
        };
        this.tasks.set(taskId, updated);
        return updated;
    }

    static async deleteTask(taskId: string): Promise<void> {
        if (!this.tasks.has(taskId)) throw Object.assign(new Error('Taak niet gevonden'), { status: 404 });
        this.tasks.delete(taskId);
    }

    static clearStateForTests(): void {
        this.tasks.clear();
    }
}
