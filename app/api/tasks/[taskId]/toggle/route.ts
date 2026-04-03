import { requireFamilySession } from "@/lib/auth";
import { getDashboardSnapshot, toggleTaskCompletion } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getDateKey } from "@/lib/schedule";

interface Context {
  params: Promise<{
    taskId: string;
  }>;
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireFamilySession();
    const { taskId } = await context.params;
    const body = (await request.json()) as { userId?: string; dateKey?: string };

    if (!body.userId?.trim()) {
      return jsonError("Kullanıcı seçilmedi.");
    }

    await toggleTaskCompletion(
      session.familyId,
      taskId,
      body.userId.trim(),
      body.dateKey ?? getDateKey()
    );

    return jsonOk(await getDashboardSnapshot());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Görev güncellenemedi.", 500);
  }
}
