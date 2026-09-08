import "server-only";

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  supabaseUrl: getEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  useLocalDb: !isProduction && getEnv("USE_LOCAL_DB") === "true",
  sessionSecret: getEnv("SESSION_SECRET") || "gelistirme-icin-gecici-gizli-anahtar"
};

export function isSupabaseConfigured() {
  return (
    !env.useLocalDb &&
    Boolean(env.supabaseUrl) &&
    Boolean(env.supabaseServiceRoleKey) &&
    env.supabaseUrl !== "https://proje-kimliginiz.supabase.co" &&
    env.supabaseServiceRoleKey !== "service-role-key"
  );
}

export function assertSupabaseEnv() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlanmalı.");
  }
}
