import { eq } from "drizzle-orm";
import type {
  CreateMatchingTemplateInput,
  MatchingTemplate,
  UpdateMatchingTemplateInput,
} from "../../../shared/src/api-types";
import { db, rawDb } from "../db";
import { screeningTemplates } from "../schema";

type ScreeningTemplateRow = typeof screeningTemplates.$inferSelect;

function toMatchingTemplate(row: ScreeningTemplateRow): MatchingTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    isDefault: row.isDefault,
    isActive: row.isActive,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ScreeningTemplatesService {
  async listTemplates(): Promise<MatchingTemplate[]> {
    const rows = await db.select().from(screeningTemplates);
    return rows.map(toMatchingTemplate);
  }

  async getTemplate(id: string): Promise<MatchingTemplate | null> {
    const [row] = await db
      .select()
      .from(screeningTemplates)
      .where(eq(screeningTemplates.id, id))
      .limit(1);
    return row ? toMatchingTemplate(row) : null;
  }

  async createTemplate(
    input: CreateMatchingTemplateInput,
  ): Promise<MatchingTemplate> {
    const now = Date.now();

    if (input.isDefault) {
      await db
        .update(screeningTemplates)
        .set({ isDefault: false, updatedAt: now });
    }

    const isDefault = input.isDefault ?? false;

    const [row] = await db
      .insert(screeningTemplates)
      .values({
        id: `scrntpl_${crypto.randomUUID()}`,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        prompt: input.prompt,
        isDefault,
        isActive: true,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return toMatchingTemplate(row);
  }

  async updateTemplate(
    id: string,
    input: UpdateMatchingTemplateInput,
  ): Promise<MatchingTemplate | null> {
    const [existingRow] = await db
      .select()
      .from(screeningTemplates)
      .where(eq(screeningTemplates.id, id))
      .limit(1);
    if (!existingRow) return null;

    const now = Date.now();

    if (input.isDefault) {
      await db
        .update(screeningTemplates)
        .set({ isDefault: false, updatedAt: now });
    }

    const setData: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) setData.name = input.name.trim();
    if (input.description !== undefined)
      setData.description = input.description.trim() || null;
    if (input.prompt !== undefined) setData.prompt = input.prompt;
    if (input.isDefault !== undefined) setData.isDefault = input.isDefault;

    const [row] = await db
      .update(screeningTemplates)
      .set(setData)
      .where(eq(screeningTemplates.id, id))
      .returning();

    return row ? toMatchingTemplate(row) : null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const [deleted] = await db
      .delete(screeningTemplates)
      .where(eq(screeningTemplates.id, id))
      .returning();
    return Boolean(deleted);
  }

  async setDefaultTemplate(id: string): Promise<MatchingTemplate | null> {
    const [existing] = await db
      .select()
      .from(screeningTemplates)
      .where(eq(screeningTemplates.id, id))
      .limit(1);
    if (!existing) return null;

    const now = Date.now();

    // Use transaction: first unset all defaults, then set the target as default
    try {
      rawDb.run("BEGIN IMMEDIATE");
      await db
        .update(screeningTemplates)
        .set({ isDefault: false, updatedAt: now });
      const [row] = await db
        .update(screeningTemplates)
        .set({ isDefault: true, updatedAt: now })
        .where(eq(screeningTemplates.id, id))
        .returning();
      rawDb.run("COMMIT");

      return row ? toMatchingTemplate(row) : null;
    } catch (error) {
      rawDb.run("ROLLBACK");
      throw error;
    }
  }

  async getDefaultTemplate(): Promise<MatchingTemplate | null> {
    const [row] = await db
      .select()
      .from(screeningTemplates)
      .where(eq(screeningTemplates.isDefault, true))
      .limit(1);
    return row ? toMatchingTemplate(row) : null;
  }
}

export const screeningTemplatesService = new ScreeningTemplatesService();
