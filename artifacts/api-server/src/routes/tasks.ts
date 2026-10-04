import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateTaskBody,
  DeleteTaskParams,
  DuplicateTaskParams,
  GetTaskParams,
  ListTasksQueryParams,
  ListTasksResponse,
  ListTasksResponseItem,
  UpdateTaskBody,
  UpdateTaskParams,
} from "@workspace/api-zod";
import { db, categoriesTable, tasksTable } from "@workspace/db";

const router: IRouter = Router();

type TaskRow = {
  task: typeof tasksTable.$inferSelect;
  categoryName: string | null;
};

function toTask(row: TaskRow) {
  return {
    ...row.task,
    categoryName: row.categoryName,
    createdAt: row.task.createdAt.toISOString(),
    updatedAt: row.task.updatedAt.toISOString(),
  };
}

async function findTask(sessionId: string, taskId: string): Promise<TaskRow | undefined> {
  const [row] = await db
    .select({ task: tasksTable, categoryName: categoriesTable.name })
    .from(tasksTable)
    .leftJoin(categoriesTable, eq(tasksTable.categoryId, categoriesTable.id))
    .where(and(eq(tasksTable.sessionId, sessionId), eq(tasksTable.id, taskId)))
    .limit(1);
  return row;
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(
    0,
    12,
  );
}

function getToday(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
      return value;
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid task filters." });
    return;
  }

  const query = parsed.data;
  const sessionId: string = res.locals.todoSessionId;
  const rows = await db
    .select({ task: tasksTable, categoryName: categoriesTable.name })
    .from(tasksTable)
    .leftJoin(categoriesTable, eq(tasksTable.categoryId, categoriesTable.id))
    .where(eq(tasksTable.sessionId, sessionId));
  const today = getToday(query.today);
  const tomorrow = shiftDate(today, 1);
  let tasks = rows.map(toTask);

  if (query.status === "active") tasks = tasks.filter((task) => !task.completed);
  if (query.status === "completed") tasks = tasks.filter((task) => task.completed);
  if (query.priority) tasks = tasks.filter((task) => task.priority === query.priority);
  if (query.categoryId) {
    tasks = tasks.filter((task) => task.categoryId === query.categoryId);
  }
  if (query.tag) {
    const tag = query.tag.toLocaleLowerCase();
    tasks = tasks.filter((task) =>
      task.tags.some((value) => value.toLocaleLowerCase() === tag),
    );
  }

  if (query.due) {
    tasks = tasks.filter((task) => {
      if (!task.dueDate) return query.due === "none";
      if (task.completed && query.due !== "none") return false;
      switch (query.due) {
        case "overdue":
          return task.dueDate < today;
        case "today":
          return task.dueDate === today;
        case "tomorrow":
          return task.dueDate === tomorrow;
        case "upcoming":
          return task.dueDate > today;
        case "none":
          return false;
        default:
          return false;
      }
    });
  }

  if (query.search?.trim()) {
    const search = query.search.trim().toLocaleLowerCase();
    tasks = tasks.filter((task) =>
      [
        task.title,
        task.description ?? "",
        task.categoryName ?? "",
        ...task.tags,
      ].some((value) => value.toLocaleLowerCase().includes(search)),
    );
  }

  const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
  const sort = query.sort ?? "dueDate";
  const direction = query.direction === "desc" ? -1 : 1;
  tasks.sort((left, right) => {
    let comparison = 0;
    switch (sort) {
      case "priority":
        comparison = priorityOrder[left.priority] - priorityOrder[right.priority];
        break;
      case "createdAt":
        comparison = left.createdAt.localeCompare(right.createdAt);
        break;
      case "title":
        comparison = left.title.localeCompare(right.title);
        break;
      case "completed":
        comparison = Number(left.completed) - Number(right.completed);
        break;
      case "dueDate":
      default:
        if (left.dueDate === null) return 1;
        if (right.dueDate === null) return -1;
        comparison = left.dueDate.localeCompare(right.dueDate);
    }
    return comparison * direction;
  });

  res.json(ListTasksResponse.parse(tasks));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.title.trim()) {
    res.status(400).json({ error: "Enter a task title to save." });
    return;
  }

  const sessionId: string = res.locals.todoSessionId;
  const input = parsed.data;
  if (input.dueDate && !isDateOnly(input.dueDate)) {
    res.status(400).json({ error: "Choose a valid due date." });
    return;
  }
  if (input.categoryId) {
    const [category] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, input.categoryId),
          eq(categoriesTable.sessionId, sessionId),
        ),
      )
      .limit(1);
    if (!category) {
      res.status(400).json({ error: "Choose a category from your list." });
      return;
    }
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      sessionId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      completed: input.completed,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      categoryId: input.categoryId ?? null,
      tags: normalizeTags(input.tags),
    })
    .returning();
  const row = await findTask(sessionId, task.id);
  res.status(201).json(ListTasksResponseItem.parse(toTask(row!)));
});

router.get("/tasks/:taskId", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid task." });
    return;
  }
  const row = await findTask(res.locals.todoSessionId, params.data.taskId);
  if (!row) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  res.json(ListTasksResponseItem.parse(toTask(row)));
});

router.patch("/tasks/:taskId", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const body = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Check the task details and try again." });
    return;
  }

  const sessionId: string = res.locals.todoSessionId;
  const existing = await findTask(sessionId, params.data.taskId);
  if (!existing) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  const input = body.data;
  if (input.title !== undefined && !input.title.trim()) {
    res.status(400).json({ error: "A task title is required." });
    return;
  }
  if (input.dueDate && !isDateOnly(input.dueDate)) {
    res.status(400).json({ error: "Choose a valid due date." });
    return;
  }
  if (input.categoryId) {
    const [category] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, input.categoryId),
          eq(categoriesTable.sessionId, sessionId),
        ),
      )
      .limit(1);
    if (!category) {
      res.status(400).json({ error: "Choose a category from your list." });
      return;
    }
  }

  const patch: Partial<typeof tasksTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.completed !== undefined) patch.completed = input.completed;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);

  await db
    .update(tasksTable)
    .set(patch)
    .where(and(eq(tasksTable.id, params.data.taskId), eq(tasksTable.sessionId, sessionId)));
  const updated = await findTask(sessionId, params.data.taskId);
  res.json(ListTasksResponseItem.parse(toTask(updated!)));
});

router.delete("/tasks/:taskId", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid task." });
    return;
  }
  const [deleted] = await db
    .delete(tasksTable)
    .where(
      and(
        eq(tasksTable.id, params.data.taskId),
        eq(tasksTable.sessionId, res.locals.todoSessionId),
      ),
    )
    .returning({ id: tasksTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  res.status(204).send();
});

router.post("/tasks/:taskId/duplicate", async (req, res): Promise<void> => {
  const params = DuplicateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid task." });
    return;
  }
  const sessionId: string = res.locals.todoSessionId;
  const source = await findTask(sessionId, params.data.taskId);
  if (!source) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  const [copy] = await db
    .insert(tasksTable)
    .values({
      sessionId,
      title: `${source.task.title} (copy)`.slice(0, 180),
      description: source.task.description,
      completed: false,
      priority: source.task.priority,
      dueDate: source.task.dueDate,
      categoryId: source.task.categoryId,
      tags: source.task.tags,
    })
    .returning();
  const row = await findTask(sessionId, copy.id);
  res.status(201).json(ListTasksResponseItem.parse(toTask(row!)));
});

export default router;