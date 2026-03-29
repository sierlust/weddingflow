import * as TasksRepo from '../repositories/tasks.repo';

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
    static async getTasks(weddingId: string): Promise<Task[]> {
        return TasksRepo.findTasksByWedding(weddingId);
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
        return TasksRepo.createTask(task);
    }

    static async updateTask(taskId: string, patch: {
        completed?: boolean;
        title?: string;
        deadline?: string;
        priority?: string;
        assignedSupplierOrgId?: string;
    }): Promise<Task> {
        const task = await TasksRepo.findTaskById(taskId);
        if (!task) throw Object.assign(new Error('Taak niet gevonden'), { status: 404 });
        const validPriorities = ['high', 'medium', 'low'];
        const updatedPatch: Partial<Task> = {
            ...(patch.completed !== undefined ? { completed: Boolean(patch.completed) } : {}),
            ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
            ...(patch.deadline !== undefined ? { deadline: patch.deadline || undefined } : {}),
            ...(patch.priority && validPriorities.includes(patch.priority) ? { priority: patch.priority as Task['priority'] } : {}),
            ...(patch.assignedSupplierOrgId !== undefined ? { assignedSupplierOrgId: patch.assignedSupplierOrgId?.trim() || undefined } : {}),
            updatedAt: new Date().toISOString(),
        };
        const updated = await TasksRepo.updateTask(taskId, updatedPatch);
        return updated!;
    }

    static async deleteTask(taskId: string): Promise<void> {
        const removed = await TasksRepo.removeTask(taskId);
        if (!removed) throw Object.assign(new Error('Taak niet gevonden'), { status: 404 });
    }

    static clearStateForTests(): void {
        TasksRepo._clearTasksStoreForTests();
    }
}
