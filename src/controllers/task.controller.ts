import { TaskService } from '../services/task.service';

export class TaskController {
    static async list(req: any, res: any) {
        const { id: weddingId } = req.params;
        const tasks = await TaskService.getTasks(weddingId);
        return res.json({ tasks });
    }

    static async create(req: any, res: any) {
        const { id: weddingId } = req.params;
        const { title, deadline, assignedSupplierOrgId, priority, source, sourcePhase } = req.body ?? {};
        const task = await TaskService.addTask(weddingId, { title, deadline, assignedSupplierOrgId, priority, source, sourcePhase });
        return res.status(201).json(task);
    }

    static async update(req: any, res: any) {
        const { taskId } = req.params;
        const { completed, title, deadline, priority, assignedSupplierOrgId } = req.body ?? {};
        const task = await TaskService.updateTask(taskId, { completed, title, deadline, priority, assignedSupplierOrgId });
        return res.json(task);
    }

    static async remove(req: any, res: any) {
        const { taskId } = req.params;
        await TaskService.deleteTask(taskId);
        return res.json({ success: true });
    }
}
