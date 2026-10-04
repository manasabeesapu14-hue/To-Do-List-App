import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetDashboardResponse } from "@workspace/api-zod";
import { db, tasksTable } from "@workspace/db";

const router: IRouter = Router();

function localDate(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return value;
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const today = localDate(req.query.today) ?? new Date().toISOString().slice(0, 10);
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.sessionId, res.locals.todoSessionId));
  const active = tasks.filter((task) => !task.completed);
  const completed = tasks.length - active.length;

  res.json(
    GetDashboardResponse.parse({
      total: tasks.length,
      active: active.length,
      completed,
      overdue: active.filter((task) => task.dueDate !== null && task.dueDate < today)
        .length,
      dueToday: active.filter((task) => task.dueDate === today).length,
      highPriority: active.filter((task) => task.priority === "high").length,
      completionPercentage:
        tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100),
    }),
  );
});

export default router;