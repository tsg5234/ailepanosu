import "server-only";

import bcrypt from "bcryptjs";
import { SAMPLE_TASK_TEMPLATES } from "@/lib/sample-data";
import { createAdminClient } from "@/lib/supabase";

const STARTER_PARENT_PIN = "1234";

const STARTER_FAMILY = {
  id: "b3295f65-42a2-4f83-92e7-6c2f3c9d5001",
  name: "Guler Ailesi",
  child_sleep_time: "22:00",
  parent_sleep_time: "00:00",
  day_reset_time: "00:00"
} as const;

const STARTER_USERS = [
  {
    id: "b3295f65-42a2-4f83-92e7-6c2f3c9d5002",
    name: "Tanju",
    role: "ebeveyn" as const,
    avatar: "\u{1F468}",
    color: "#2DD4BF",
    birthdate: null
  },
  {
    id: "b3295f65-42a2-4f83-92e7-6c2f3c9d5003",
    name: "Esra",
    role: "ebeveyn" as const,
    avatar: "\u{1F469}",
    color: "#FB7185",
    birthdate: null
  },
  {
    id: "b3295f65-42a2-4f83-92e7-6c2f3c9d5004",
    name: "Poyraz",
    role: "\u00e7ocuk" as const,
    avatar: "\u{1F981}",
    color: "#60A5FA",
    birthdate: "2016-05-14"
  },
  {
    id: "b3295f65-42a2-4f83-92e7-6c2f3c9d5005",
    name: "Aden",
    role: "\u00e7ocuk" as const,
    avatar: "\u{1F984}",
    color: "#22C55E",
    birthdate: "2019-09-02"
  }
] as const;

const STARTER_CHILD_IDS = STARTER_USERS.filter((user) => user.role === "\u00e7ocuk").map(
  (user) => user.id
);

const STARTER_TASK_IDS = [
  "b3295f65-42a2-4f83-92e7-6c2f3c9d5011",
  "b3295f65-42a2-4f83-92e7-6c2f3c9d5012",
  "b3295f65-42a2-4f83-92e7-6c2f3c9d5013",
  "b3295f65-42a2-4f83-92e7-6c2f3c9d5014",
  "b3295f65-42a2-4f83-92e7-6c2f3c9d5015",
  "b3295f65-42a2-4f83-92e7-6c2f3c9d5016"
] as const;

const STARTER_REWARDS = [
  {
    id: "b3295f65-42a2-4f83-92e7-6c2f3c9d5021",
    title: "Film gecesi secimi",
    points_required: 120,
    approval_required: false
  },
  {
    id: "b3295f65-42a2-4f83-92e7-6c2f3c9d5022",
    title: "Hafta sonu dondurma",
    points_required: 180,
    approval_required: true
  }
] as const;

let seedPromise: Promise<void> | null = null;

if (SAMPLE_TASK_TEMPLATES.length > STARTER_TASK_IDS.length) {
  throw new Error("Starter task id list is shorter than SAMPLE_TASK_TEMPLATES.");
}

function fail(message: string, error: unknown): never {
  const detail = error instanceof Error ? error.message : "Unknown error";
  throw new Error(`${message}: ${detail}`);
}

export async function ensureStarterSeeded() {
  seedPromise ??= seedStarterData().finally(() => {
    seedPromise = null;
  });

  return seedPromise;
}

async function seedStarterData() {
  const supabase = createAdminClient();

  const { data: existingFamily, error: familyError } = await supabase
    .from("families")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (familyError) {
    fail("Starter seed check failed", familyError);
  }

  if (existingFamily) {
    await restoreStarterUsersForFamily(existingFamily.id);
    return;
  }

  const parentPinHash = await bcrypt.hash(STARTER_PARENT_PIN, 10);

  const { error: starterFamilyError } = await supabase.from("families").upsert(
    [
      {
        id: STARTER_FAMILY.id,
        name: STARTER_FAMILY.name,
        parent_pin_hash: parentPinHash,
        child_sleep_time: STARTER_FAMILY.child_sleep_time,
        parent_sleep_time: STARTER_FAMILY.parent_sleep_time,
        day_reset_time: STARTER_FAMILY.day_reset_time
      }
    ],
    {
      onConflict: "id",
      ignoreDuplicates: true
    }
  );

  if (starterFamilyError) {
    fail("Starter family could not be created", starterFamilyError);
  }

  const { error: usersError } = await supabase.from("users").upsert(
    STARTER_USERS.map((user) => ({
      id: user.id,
      family_id: STARTER_FAMILY.id,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      color: user.color,
      birthdate: user.birthdate
    })),
    {
      onConflict: "id",
      ignoreDuplicates: true
    }
  );

  if (usersError) {
    fail("Starter users could not be created", usersError);
  }

  const starterTasks = SAMPLE_TASK_TEMPLATES.map((task, index) => ({
    id: STARTER_TASK_IDS[index],
    family_id: STARTER_FAMILY.id,
    title: task.title,
    icon: task.icon,
    points: task.points,
    assigned_to: STARTER_CHILD_IDS,
    schedule_type: "gunluk" as const,
    days: [],
    special_dates: [],
    time_block: task.timeBlock
  }));

  const [{ error: tasksError }, { error: rewardsError }] = await Promise.all([
    supabase.from("tasks").upsert(starterTasks, {
      onConflict: "id",
      ignoreDuplicates: true
    }),
    supabase.from("rewards").upsert(
      STARTER_REWARDS.map((reward) => ({
        id: reward.id,
        family_id: STARTER_FAMILY.id,
        title: reward.title,
        points_required: reward.points_required,
        approval_required: reward.approval_required
      })),
      {
        onConflict: "id",
        ignoreDuplicates: true
      }
    )
  ]);

  if (tasksError) {
    fail("Starter tasks could not be created", tasksError);
  }

  if (rewardsError) {
    fail("Starter rewards could not be created", rewardsError);
  }
}

async function restoreStarterUsersForFamily(familyId: string) {
  const supabase = createAdminClient();

  const [{ data: users, error: usersError }, { data: tasks, error: tasksError }] =
    await Promise.all([
      supabase.from("users").select("id").eq("family_id", familyId),
      supabase.from("tasks").select("assigned_to").eq("family_id", familyId)
    ]);

  if (usersError) {
    fail("Starter user restore check failed", usersError);
  }

  if (tasksError) {
    fail("Starter task restore check failed", tasksError);
  }

  const existingUserIds = new Set((users ?? []).map((user) => user.id as string));
  const assignedUserIds = new Set(
    (tasks ?? []).flatMap((task) => ((task.assigned_to as string[] | null) ?? []))
  );

  const missingUsers =
    existingUserIds.size === 0
      ? [...STARTER_USERS]
      : STARTER_USERS.filter(
          (user) => assignedUserIds.has(user.id) && !existingUserIds.has(user.id)
        );

  if (missingUsers.length === 0) {
    return;
  }

  const { error: restoreUsersError } = await supabase.from("users").upsert(
    missingUsers.map((user) => ({
      id: user.id,
      family_id: familyId,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      color: user.color,
      birthdate: user.birthdate
    })),
    {
      onConflict: "id"
    }
  );

  if (restoreUsersError) {
    fail("Starter users could not be restored", restoreUsersError);
  }
}
