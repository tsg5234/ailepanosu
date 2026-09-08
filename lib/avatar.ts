import type { UserRole } from "@/lib/types";

export const PARENT_AVATARS = ["👩", "👨", "🧑", "👵", "👴", "🙂", "😎", "🫶"];
export const CHILD_AVATARS = ["🦁", "🐼", "🐯", "🦊", "🐸", "🐻", "🦄", "🚀"];

export function getAvatarOptions(role: UserRole) {
  return role === "ebeveyn" ? PARENT_AVATARS : CHILD_AVATARS;
}

export function getDefaultAvatar() {
  return "";
}

export function isImageAvatar(avatar: string) {
  const value = avatar.trim();

  return (
    value.startsWith("data:image/") ||
    value.startsWith("blob:") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("/")
  );
}

export function normalizeAvatarForRole(_role: UserRole, avatar: string) {
  const value = avatar.trim();

  if (!value) {
    return "";
  }

  if (isImageAvatar(value)) {
    return value;
  }

  return "";
}
