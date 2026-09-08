import { requireParentSession } from "@/lib/auth";
import { adjustPoints, getDashboardSnapshot } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const session = await requireParentSession();
    const body = (await request.json()) as { userId?: string; delta?: number; note?: string };

    if (!body.userId?.trim() || typeof body.delta !== "number") {
      return jsonError("Kullanıcı ve harçlık farkı gerekli.");
    }

    await adjustPoints(
      session.familyId,
      body.userId.trim(),
      body.delta,
      body.note?.trim() || "Manuel düzenleme"
    );
    return jsonOk(await getDashboardSnapshot());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Harçlık düzenlenemedi.", 500);
  }
}
