import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export type TaskPriority = "high" | "medium" | "low" | "none";

export const categoriesTable = pgTable(
  "todo_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("todo_categories_session_name_idx").on(
      table.sessionId,
      sql`lower(${table.name})`,
    ),
  ],
);

export const tasksTable = pgTable(
  "todo_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    completed: boolean("completed").notNull().default(false),
    priority: varchar("priority", { length: 16 })
      .$type<TaskPriority>()
      .notNull()
      .default("none"),
    dueDate: date("due_date", { mode: "string" }),
    categoryId: uuid("category_id").references(() => categoriesTable.id, {
      onDelete: "set null",
    }),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);