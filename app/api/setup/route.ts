import { requireAccountSession, updateSessionFamily } from "@/lib/auth";
import { bootstrapApp } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import type { SetupPayload } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await requireAccountSession();
    const body = (await request.json()) as SetupPayload;
    const profiles = Array.isArray(body.profiles)
      ? body.profiles
          .map((profile) => ({
            name: profile.name?.trim() ?? "",
            role: profile.role,
            avatar: profile.avatar?.trim() ?? "",
            color: profile.color?.trim() ?? "",
            birthdate: profile.birthdate?.trim() || null
          }))
          .filter((profile) => profile.name && profile.avatar && profile.color)
      : [];

    if (!body.familyName?.trim() || !body.pin?.trim()) {
      return jsonError("Aile adi ve PIN gerekli.");
    }

    if (profiles.length === 0) {
      return jsonError("En az bir profil ekleyin.");
    }

    if (!profiles.some((profile) => profile.role === "ebeveyn")) {
      return jsonError("En az bir ebeveyn profili gerekli.");
    }

    if (body.pin.trim().length < 4) {
      return jsonError("PIN en az 4 haneli olmali.");
    }

    const result = await bootstrapApp(
      {
        accountId: session.accountId,
        username: session.username,
        familyId: session.familyId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken
      },
      {
        familyName: body.familyName.trim(),
        pin: body.pin.trim(),
        profiles,
        includeSampleData: Boolean(body.includeSampleData)
      }
    );

    await updateSessionFamily(session, result.familyId);

    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Kurulum yapilamadi.", 500);
  }
}
