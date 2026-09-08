import { requireParentSession } from "@/lib/auth";
import { getDashboardSnapshot, resolveReward } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

interface Context {
  params: Promise<{
    redemptionId: string;
  }>;
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireParentSession();
    const { redemptionId } = await context.params;
    const body = (await request.json()) as { status?: "onaylandi" | "reddedildi" };

    if (!body.status) {
      return jsonError("Durum bilgisi gerekli.");
    }

    await resolveReward(session.familyId, redemptionId, body.status);
    return jsonOk(await getDashboardSnapshot());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Talep güncellenemedi.", 500);
  }
}
