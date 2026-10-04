import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCategoryBody,
  DeleteCategoryParams,
  ListCategoriesResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
} from "@workspace/api-zod";
import { db, categoriesTable } from "@workspace/db";

const router: IRouter = Router();

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function toCategory(category: typeof categoriesTable.$inferSelect) {
  return { ...category, createdAt: category.createdAt.toISOString() };
}

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.sessionId, res.locals.todoSessionId))
    .orderBy(categoriesTable.name);
  res.json(ListCategoriesResponse.parse(categories.map(toCategory)));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.name.trim()) {
    res.status(400).json({ error: "Enter a category name." });
    return;
  }
  try {
    const [category] = await db
      .insert(categoriesTable)
      .values({
        sessionId: res.locals.todoSessionId,
        name: parsed.data.name.trim(),
      })
      .returning();
    res.status(201).json(ListCategoriesResponse.element.parse(toCategory(category)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That category already exists." });
      return;
    }
    throw error;
  }
});

router.patch("/categories/:categoryId", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  const body = UpdateCategoryBody.safeParse(req.body);
  if (!params.success || !body.success || !body.data.name.trim()) {
    res.status(400).json({ error: "Enter a valid category name." });
    return;
  }
  try {
    const [category] = await db
      .update(categoriesTable)
      .set({ name: body.data.name.trim() })
      .where(
        and(
          eq(categoriesTable.id, params.data.categoryId),
          eq(categoriesTable.sessionId, res.locals.todoSessionId),
        ),
      )
      .returning();
    if (!category) {
      res.status(404).json({ error: "Category not found." });
      return;
    }
    res.json(ListCategoriesResponse.element.parse(toCategory(category)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That category already exists." });
      return;
    }
    throw error;
  }
});

router.delete("/categories/:categoryId", async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid category." });
    return;
  }
  const [category] = await db
    .delete(categoriesTable)
    .where(
      and(
        eq(categoriesTable.id, params.data.categoryId),
        eq(categoriesTable.sessionId, res.locals.todoSessionId),
      ),
    )
    .returning({ id: categoriesTable.id });
  if (!category) {
    res.status(404).json({ error: "Category not found." });
    return;
  }
  res.status(204).send();
});

export default router;