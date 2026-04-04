import { requireParentSession } from "@/lib/auth";
import { deleteUserProfile, getDashboardSnapshot } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await requireParentSession();
    const { userId } = await context.params;

    await deleteUserProfile(session.familyId, userId);

    return jsonOk(await getDashboardSnapshot());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Profil silinemedi.", 400);
  }
}
