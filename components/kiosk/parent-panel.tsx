"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, BookOpen, CheckCircle2, History, Pencil, Settings2, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { AvatarDisplay } from "@/components/kiosk/avatar-display";
import { AvatarPicker } from "@/components/kiosk/avatar-picker";
import { formatAllowance } from "@/lib/allowance";
import { getDefaultAvatar, normalizeAvatarForRole } from "@/lib/avatar";
import { getDateKey, isTaskCompleted, isTaskScheduledForDate, TIME_BLOCK_LABELS, WEEKDAY_KEYS, WEEKDAY_LABELS } from "@/lib/schedule";
import {
  DEFAULT_PLAN_SLOTS,
  PLAN_WEEKDAYS,
  PLAN_WEEKDAY_LABELS
} from "@/lib/profile-plan";
import { DEFAULT_TASK_ICON } from "@/lib/task-defaults";
import type {
  AccountPasswordChangePayload,
  DashboardPayload,
  FamilySettingsPayload,
  ProfilePlanEntryRecord,
  ProfilePlanSavePayload,
  ParentPinChangePayload,
  TaskFormPayload,
  TaskRecord,
  TimeBlock,
  UserFormPayload
} from "@/lib/types";

type TabId = "kullanicilar" | "gorevler" | "planlar" | "harcliklar" | "gecmis" | "ayarlar";

interface ParentPanelProps {
  open: boolean;
  standalone?: boolean;
  data: DashboardPayload | null;
  working: boolean;
  onClose: () => void;
  onOpenLogin: () => void;
  onSaveUser: (payload: UserFormPayload) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onSaveTask: (payload: TaskFormPayload) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<boolean>;
  onSaveProfilePlan: (payload: ProfilePlanSavePayload) => Promise<void>;
  onReorderTasks: (orderedTaskIds: string[]) => Promise<void>;
  onAdjustPoints: (userId: string, delta: number, note: string) => Promise<void>;
  onUndoTaskCompletion: (
    taskId: string,
    userId: string,
    dateKey: string,
    taskTitle: string
  ) => Promise<void>;
  onResetProgress: () => Promise<void>;
  onUpdateSettings: (payload: FamilySettingsPayload) => Promise<void>;
  onChangeAccountPassword: (payload: AccountPasswordChangePayload) => Promise<void>;
  onChangeParentPin: (payload: ParentPinChangePayload) => Promise<void>;
  onLogout: () => Promise<void>;
}

const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "kullanicilar", label: "Kullanıcılar", icon: Users },
  { id: "gorevler", label: "Görevler", icon: CheckCircle2 },
  { id: "planlar", label: "Planlar", icon: BookOpen },
  { id: "harcliklar", label: "Hesap", icon: Wallet },
  { id: "gecmis", label: "Geçmiş", icon: History },
  { id: "ayarlar", label: "Ayarlar", icon: Settings2 }
];

const PROFILE_COLORS = [
  "#60A5FA",
  "#34D399",
  "#F97316",
  "#F472B6",
  "#A78BFA",
  "#22C55E",
  "#F59E0B",
  "#06B6D4"
];

function getRandomProfileColor() {
  return PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)] ?? PROFILE_COLORS[0];
}

function createUserDefaults(): UserFormPayload {
  return {
    name: "",
    role: "çocuk",
    avatar: getDefaultAvatar(),
    color: getRandomProfileColor(),
    birthdate: ""
  };
}

const taskDefaults: TaskFormPayload = {
  title: "",
  icon: DEFAULT_TASK_ICON,
  points: 20,
  assignedTo: [],
  scheduleType: "gunluk",
  days: [],
  specialDates: [],
  timeBlock: "sabah"
};

function createTaskDraft(ownerId?: string): TaskFormPayload {
  return {
    ...taskDefaults,
    assignedTo: ownerId ? [ownerId] : []
  };
}

function Card({
  title,
  description,
  children,
  className
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`parent-management-panel ${className ?? ""}`}>
      <div className="parent-management-heading">
        <div>
          <span>Yönetim alanı</span>
          <strong>{title}</strong>
        </div>
        <p>{description}</p>
      </div>
      <div className="parent-management-body">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold text-[color:var(--text-muted)]">{children}</span>;
}

function toWeekText(days: string[]) {
  return days.map((day) => WEEKDAY_LABELS[day as keyof typeof WEEKDAY_LABELS] ?? day).join(", ");
}

const WEEKDAY_PRESETS = [
  { id: "her-gun", label: "Her gün", days: [...WEEKDAY_KEYS] },
  { id: "hafta-ici", label: "Hafta içi", days: WEEKDAY_KEYS.filter((day) => day !== "cts" && day !== "paz") },
  { id: "hafta-sonu", label: "Hafta sonu", days: ["cts", "paz"] }
] as const;

type TaskListTimeFilter = "tum" | TimeBlock;
interface ProfilePlanDraft {
  slots: Record<number, {
    label: string;
    startTime: string;
    endTime: string;
  }>;
  cells: Record<string, Record<number, string>>;
}

const POINT_ADD_PRESETS = [10, 20, 50, 100, 200];
const POINT_SPEND_PRESETS = [-10, -20, -50, -100, -200];

const TASK_LIST_TIME_FILTERS: Array<{ id: TaskListTimeFilter; label: string }> = [
  { id: "tum", label: "Tüm" },
  { id: "sabah", label: TIME_BLOCK_LABELS.sabah },
  { id: "ogleden_sonra", label: TIME_BLOCK_LABELS.ogleden_sonra },
  { id: "aksam", label: TIME_BLOCK_LABELS.aksam },
  { id: "her_zaman", label: TIME_BLOCK_LABELS.her_zaman }
];

const TASK_TABLE_TIME_BLOCKS = TASK_LIST_TIME_FILTERS.filter(
  (filter): filter is { id: TimeBlock; label: string } => filter.id !== "tum"
);

const TASK_TIME_BLOCK_ORDER: Record<TimeBlock, number> = {
  sabah: 0,
  ogleden_sonra: 1,
  aksam: 2,
  her_zaman: 3
};

function createEmptyProfilePlanDraft(): ProfilePlanDraft {
  return {
    slots: Object.fromEntries(
      DEFAULT_PLAN_SLOTS.map((slot) => [
        slot.slotIndex,
        {
          label: slot.label,
          startTime: slot.startTime,
          endTime: slot.endTime
        }
      ])
    ) as ProfilePlanDraft["slots"],
    cells: Object.fromEntries(
      PLAN_WEEKDAYS.map((weekday) => [
        weekday,
        Object.fromEntries(DEFAULT_PLAN_SLOTS.map((slot) => [slot.slotIndex, ""]))
      ])
    ) as ProfilePlanDraft["cells"]
  };
}

function createProfilePlanDraft(entries: ProfilePlanEntryRecord[], userId: string) {
  const draft = createEmptyProfilePlanDraft();

  entries
    .filter((entry) => entry.user_id === userId)
    .forEach((entry) => {
      if (draft.slots[entry.slot_index]) {
        draft.slots[entry.slot_index] = {
          label: entry.slot_label,
          startTime: entry.start_time,
          endTime: entry.end_time
        };
      }

      if (draft.cells[entry.weekday]) {
        draft.cells[entry.weekday][entry.slot_index] = entry.title;
      }
    });

  return draft;
}

function buildProfilePlanPayload(userId: string, draft: ProfilePlanDraft): ProfilePlanSavePayload {
  return {
    userId,
    entries: PLAN_WEEKDAYS.flatMap((weekday) =>
      DEFAULT_PLAN_SLOTS.map((slot) => ({
        weekday,
        slotIndex: slot.slotIndex,
        slotLabel: draft.slots[slot.slotIndex]?.label.trim() || slot.label,
        startTime: draft.slots[slot.slotIndex]?.startTime || slot.startTime,
        endTime: draft.slots[slot.slotIndex]?.endTime || slot.endTime,
        title: draft.cells[weekday]?.[slot.slotIndex]?.trim() ?? ""
      }))
    )
  };
}

function hasSameDays(left: string[], right: readonly string[]) {
  return WEEKDAY_KEYS.every((key) => left.includes(key) === right.includes(key));
}

function getTaskScheduleSummary(task: TaskRecord) {
  if (task.schedule_type === "gunluk") {
    return "Her gün";
  }

  if (task.schedule_type === "haftalik") {
    return toWeekText(task.days);
  }

  return task.special_dates.join(", ");
}

function dateKeyToLocalDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function getRecentHistoryDays(todayDateKey: string, count = 14) {
  const today = dateKeyToLocalDate(todayDateKey);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const dateKey = getDateKey(date);
    const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(date);
    const label = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date);

    return {
      date,
      dateKey,
      label: index === 0 ? "Bugün" : index === 1 ? "Dün" : label,
      detail: `${weekday} ${label}`
    };
  });
}

function getCompletionForTask(
  completions: DashboardPayload["completions"],
  taskId: string,
  userId: string,
  dateKey: string
) {
  return completions.find(
    (completion) =>
      completion.task_id === taskId &&
      completion.user_id === userId &&
      completion.completion_date === dateKey
  );
}

export function ParentPanel(props: ParentPanelProps) {
  const {
    open,
    standalone,
    data,
    working,
    onClose,
    onOpenLogin,
    onSaveUser,
    onDeleteUser,
    onSaveTask,
    onDeleteTask,
    onSaveProfilePlan,
    onReorderTasks,
    onAdjustPoints,
    onUndoTaskCompletion,
    onUpdateSettings,
    onChangeAccountPassword,
    onChangeParentPin,
  } = props;

  const [tab, setTab] = useState<TabId>("kullanicilar");
  const [userDraft, setUserDraft] = useState<UserFormPayload>(() => createUserDefaults());
  const [taskDraft, setTaskDraft] = useState<TaskFormPayload>(taskDefaults);
  const [specialDate, setSpecialDate] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [pointsUserId, setPointsUserId] = useState("");
  const [pointsDeltaInput, setPointsDeltaInput] = useState("10");
  const [pointsNote, setPointsNote] = useState("Hesap hareketi");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskTimeFilter, setTaskTimeFilter] = useState<TaskListTimeFilter>("tum");
  const [taskUserView, setTaskUserView] = useState<string>("");
  const [planUserView, setPlanUserView] = useState<string>("");
  const [planDraft, setPlanDraft] = useState<ProfilePlanDraft>(() => createEmptyProfilePlanDraft());
  const [historyUserId, setHistoryUserId] = useState<string>("");
  const [historyDateKey, setHistoryDateKey] = useState<string>("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    if (!data?.family) {
      return;
    }
    setFamilyName(data.family.name);
    setAudioEnabled(data.family.audio_enabled);
    setPointsUserId((current) => current || data.users[0]?.id || "");
    setPlanUserView((current) => current || data.users[0]?.id || "");
    setHistoryUserId((current) => current || data.users[0]?.id || "");
    setHistoryDateKey((current) => current || data.today.dateKey);
  }, [data]);

  useEffect(() => {
    if (!data?.users.length) {
      setTaskUserView("");
      setPlanUserView("");
      setHistoryUserId("");
      return;
    }

    const validUserIds = new Set(data.users.map((user) => user.id));

    setTaskUserView((current) => (validUserIds.has(current) ? current : data.users[0].id));
    setPlanUserView((current) => (validUserIds.has(current) ? current : data.users[0].id));
    setHistoryUserId((current) => (validUserIds.has(current) ? current : data.users[0].id));
    setTaskDraft((current) => {
      const currentOwnerId = current.assignedTo[0];
      if (currentOwnerId && validUserIds.has(currentOwnerId)) {
        return current;
      }

      return createTaskDraft(data.users[0].id);
    });
  }, [data?.users]);

  useEffect(() => {
    if (!planUserView) {
      setPlanDraft(createEmptyProfilePlanDraft());
      return;
    }

    setPlanDraft(createProfilePlanDraft(data?.profilePlan ?? [], planUserView));
  }, [data?.profilePlan, planUserView]);

  useEffect(() => {
    if (!taskUserView) {
      return;
    }

    setTaskDraft((current) => {
      if (current.id || current.assignedTo[0] === taskUserView) {
        return current;
      }

      return {
        ...current,
        assignedTo: [taskUserView]
      };
    });
  }, [taskUserView]);

  const userLookup = useMemo(
    () => Object.fromEntries((data?.users ?? []).map((user) => [user.id, user])),
    [data?.users]
  );
  const taskUsers = data?.users ?? [];
  const selectedTaskUser = taskUserView ? userLookup[taskUserView] : undefined;
  const selectedPlanUser = planUserView ? userLookup[planUserView] : undefined;
  const selectedPlanCount = useMemo(
    () =>
      DEFAULT_PLAN_SLOTS.reduce(
        (total, slot) =>
          total +
          PLAN_WEEKDAYS.filter((weekday) => planDraft.cells[weekday]?.[slot.slotIndex]?.trim()).length,
        0
      ),
    [planDraft]
  );
  const filteredTasks = useMemo(() => {
    const searchTerm = taskSearch.trim().toLocaleLowerCase("tr-TR");
    return (data?.tasks ?? [])
      .filter((task) => {
      const matchesUser = Boolean(taskUserView) && task.assigned_to.includes(taskUserView);
      if (!matchesUser) {
        return false;
      }

      const matchesTime = taskTimeFilter === "tum" || task.time_block === taskTimeFilter;
      if (!matchesTime) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const assignedNames = task.assigned_to
        .map((id) => userLookup[id]?.name ?? "")
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return [
        task.title,
        TIME_BLOCK_LABELS[task.time_block],
        getTaskScheduleSummary(task),
        assignedNames
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(searchTerm);
      })
      .sort((left, right) => {
        const timeOrder = TASK_TIME_BLOCK_ORDER[left.time_block] - TASK_TIME_BLOCK_ORDER[right.time_block];
        if (timeOrder !== 0) {
          return timeOrder;
        }

        return Date.parse(left.created_at) - Date.parse(right.created_at);
      });
  }, [data?.tasks, taskSearch, taskTimeFilter, taskUserView, userLookup]);

  const filteredTaskGroups = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        title: string;
        entries: TaskRecord[];
      }
    >();

    filteredTasks.forEach((task) => {
      const key = task.title.trim().toLocaleLowerCase("tr-TR");

      const existing = grouped.get(key);
      if (existing) {
        existing.entries.push(task);
        return;
      }

      grouped.set(key, {
        key,
        title: task.title,
        entries: [task]
      });
    });

    return Array.from(grouped.values());
  }, [filteredTasks]);
  const filteredTaskCount = useMemo(
    () => filteredTaskGroups.reduce((total, group) => total + group.entries.length, 0),
    [filteredTaskGroups]
  );
  const visibleTaskPoints = useMemo(
    () =>
      filteredTaskGroups.reduce(
        (total, group) => total + group.entries.reduce((groupTotal, task) => groupTotal + task.points, 0),
        0
      ),
    [filteredTaskGroups]
  );
  const todaysPotentialByUser = useMemo(() => {
    if (!data?.family) {
      return [];
    }

    const now = new Date();

    return data.users
      .map((user) => {
        const todaysTasks = data.tasks.filter(
          (task) =>
            task.assigned_to.includes(user.id) &&
            isTaskScheduledForDate(task, data.today.dateKey, now, data.family)
        );

        return {
          user,
          taskCount: todaysTasks.length,
          points: todaysTasks.reduce((total, task) => total + task.points, 0)
        };
      })
      .filter((item) => item.taskCount > 0)
      .sort((left, right) => {
        if (right.points !== left.points) {
          return right.points - left.points;
        }

        return left.user.name.localeCompare(right.user.name, "tr");
      });
  }, [data]);
  const selectedTaskUserPotential = useMemo(
    () => (taskUserView ? todaysPotentialByUser.find((item) => item.user.id === taskUserView) : undefined),
    [taskUserView, todaysPotentialByUser]
  );
  const parsedPointsDelta =
    pointsDeltaInput.trim() !== "" && pointsDeltaInput !== "-" ? Number(pointsDeltaInput) : null;
  const canSubmitPoints = parsedPointsDelta !== null && Number.isFinite(parsedPointsDelta);

  const historyDays = useMemo(
    () => getRecentHistoryDays(data?.today.dateKey ?? getDateKey()),
    [data?.today.dateKey]
  );
  const selectedHistoryUser = historyUserId ? userLookup[historyUserId] : undefined;
  const selectedHistoryDay = historyDays.find((day) => day.dateKey === historyDateKey) ?? historyDays[0];
  const historyTasks = useMemo(() => {
    if (!data?.family || !selectedHistoryUser || !selectedHistoryDay) {
      return [];
    }

    return [...data.tasks]
      .filter((task) =>
        task.assigned_to.includes(selectedHistoryUser.id) &&
        isTaskScheduledForDate(task, selectedHistoryDay.dateKey, selectedHistoryDay.date, data.family)
      )
      .sort((left, right) => {
        const timeOrder = TASK_TIME_BLOCK_ORDER[left.time_block] - TASK_TIME_BLOCK_ORDER[right.time_block];
        if (timeOrder !== 0) {
          return timeOrder;
        }

        return Date.parse(left.created_at) - Date.parse(right.created_at);
      });
  }, [data?.family, data?.tasks, selectedHistoryDay, selectedHistoryUser]);
  const completedHistoryTasks = useMemo(
    () =>
      historyTasks.filter((task) =>
        isTaskCompleted(data?.completions ?? [], task.id, selectedHistoryUser?.id ?? "", selectedHistoryDay?.dateKey ?? "")
      ),
    [data?.completions, historyTasks, selectedHistoryDay?.dateKey, selectedHistoryUser?.id]
  );
  const historyPotentialPoints = historyTasks.reduce((total, task) => total + task.points, 0);
  const historyEarnedPoints = completedHistoryTasks.reduce((total, task) => {
    const completion = getCompletionForTask(
      data?.completions ?? [],
      task.id,
      selectedHistoryUser?.id ?? "",
      selectedHistoryDay?.dateKey ?? ""
    );

    return total + (completion?.points_earned ?? task.points);
  }, 0);

  const loadTaskIntoDraft = (task: TaskRecord) => {
    setTaskDraft({
      id: task.id,
      title: task.title,
      icon: task.icon || DEFAULT_TASK_ICON,
      points: task.points,
      assignedTo: taskUserView ? [taskUserView] : [...task.assigned_to],
      scheduleType: task.schedule_type,
      days: task.days,
      specialDates: task.special_dates,
      timeBlock: task.time_block
    });
    document.getElementById("parent-task-title")?.focus();
  };

  const canReorderTasks = Boolean(taskUserView);

  const getTaskMoveScopeIds = (task: TaskRecord) =>
    filteredTasks.filter((item) => item.time_block === task.time_block).map((item) => item.id);

  const moveTask = async (task: TaskRecord, direction: -1 | 1) => {
    const moveableTaskIds = getTaskMoveScopeIds(task);
    const currentIndex = moveableTaskIds.indexOf(task.id);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= moveableTaskIds.length) {
      return;
    }

    const reordered = [...moveableTaskIds];
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    await onReorderTasks(reordered);
  };

  const handleSaveSettings = async () => {
    await onUpdateSettings({
      name: familyName,
      audioEnabled
    });
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      window.alert("Mevcut şifre ve yeni şifre gerekli.");
      return;
    }

    if (newPassword !== confirmPassword) {
      window.alert("Yeni şifre tekrar alanı eşleşmiyor.");
      return;
    }

    await onChangeAccountPassword({
      currentPassword,
      newPassword
    });

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangePin = async () => {
    if (!currentPin || !newPin) {
      window.alert("Mevcut PIN ve yeni PIN gerekli.");
      return;
    }

    if (newPin !== confirmPin) {
      window.alert("Yeni PIN tekrar alanı eşleşmiyor.");
      return;
    }

    await onChangeParentPin({
      currentPin,
      newPin
    });

    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
  };

  const handleDeleteSelectedUser = async () => {
    if (!userDraft.id) {
      return;
    }

    if (!window.confirm("Bu profili silmek istediğine emin misin? Bu profile bağlı görev kayıtları da güncellenir.")) {
      return;
    }

    await onDeleteUser(userDraft.id);
    setUserDraft(createUserDefaults());
  };

  const lockedView = (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="glass-panel-strong max-w-xl rounded-[2rem] p-8 text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-teal-600" />
        <h2 className="mt-4 text-3xl font-semibold">Yönetim girişi gerekli</h2>
        <p className="mt-3 text-[color:var(--text-muted)]">
          Yönetim araçları yalnızca PIN doğrulaması ile açılır.
        </p>
        <button
          onClick={onOpenLogin}
          className="mt-6 rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white"
        >
          PIN ile giriş yap
        </button>
      </div>
    </div>
  );

  const usersTab = (
    <div className="parent-users-workspace">
      <section className="parent-user-editor-panel">
        <div className="parent-panel-heading">
          <div>
            <span>Profil merkezi</span>
            <strong>{userDraft.id ? "Profili düzenle" : "Yeni profil"}</strong>
          </div>
          <button type="button" onClick={() => setUserDraft(createUserDefaults())}>
            Yeni profil
          </button>
        </div>

        <div className="parent-user-editor-grid">
          <div
            className="parent-user-preview"
            style={{ "--profile-color": userDraft.color } as CSSProperties}
          >
            <div className="parent-user-preview-avatar">
              <AvatarDisplay avatar={userDraft.avatar} name={userDraft.name || "Profil"} />
            </div>
            <div>
              <span>{userDraft.id ? "Seçili profil" : "Yeni profil"}</span>
              <strong>{userDraft.name || "Profil adı"}</strong>
              <em>{userDraft.role === "ebeveyn" ? "Ebeveyn" : "Çocuk"}</em>
            </div>
          </div>

          <div className="parent-user-fields">
            <label>
              <Label>İsim</Label>
              <input
                value={userDraft.name}
                onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <Label>Rol</Label>
              <select
                value={userDraft.role}
                onChange={(event) =>
                  setUserDraft((current) => ({
                    ...current,
                    role: event.target.value as UserFormPayload["role"],
                    avatar: normalizeAvatarForRole(
                      event.target.value as UserFormPayload["role"],
                      current.avatar
                    ),
                    birthdate:
                      event.target.value === "ebeveyn" ? null : current.birthdate
                  }))
                }
              >
                <option value="çocuk">Çocuk</option>
                <option value="ebeveyn">Ebeveyn</option>
              </select>
            </label>
            <label>
              <Label>Doğum tarihi</Label>
              <input
                type="date"
                value={userDraft.birthdate ?? ""}
                onChange={(event) => setUserDraft((current) => ({ ...current, birthdate: event.target.value }))}
              />
            </label>
          </div>
        </div>

        <div className="parent-user-customize">
          <div className="parent-avatar-compact">
            <AvatarPicker
              compact
              role={userDraft.role}
              value={userDraft.avatar}
              onChange={(avatar) => setUserDraft((current) => ({ ...current, avatar }))}
            />
          </div>
        </div>

        <div className="parent-editor-actions">
          <button onClick={() => onSaveUser(userDraft)} disabled={working} className="is-primary">
            {userDraft.id ? "Güncelle" : "Kullanıcı ekle"}
          </button>
          {userDraft.id ? (
            <button onClick={handleDeleteSelectedUser} disabled={working} className="is-danger">
              Profili sil
            </button>
          ) : null}
          <button onClick={() => setUserDraft(createUserDefaults())} className="is-secondary">
            Temizle
          </button>
        </div>
      </section>

      <section className="parent-profile-directory-panel">
        <div className="parent-panel-heading">
          <div>
            <span>Aile profilleri</span>
            <strong>Mevcut profiller</strong>
          </div>
        </div>
        <div className="parent-profile-list soft-scrollbar">
          {data?.users.map((user) => (
            <button
              key={user.id}
              onClick={() =>
                setUserDraft({
                  id: user.id,
                  name: user.name,
                  role: user.role,
                  avatar: user.avatar,
                  color: user.color,
                  birthdate: user.birthdate ?? ""
                })
              }
              className={`parent-profile-button ${userDraft.id === user.id ? "is-active" : ""}`}
            >
              <div className="parent-profile-row">
                <div
                  className="parent-profile-avatar"
                  style={{ backgroundColor: `${user.color}22`, color: user.color }}
                >
                  <AvatarDisplay avatar={user.avatar} name={user.name} />
                </div>
                <div className="parent-profile-copy">
                  <div className="parent-profile-name">{user.name}</div>
                  <div className="parent-profile-meta">
                    {user.role === "ebeveyn" ? "Ebeveyn" : "Çocuk"} / {formatAllowance(user.points)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  const tasksTab = (
    <div className="space-y-5">
      <div className="parent-management-toolbar">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-950">Kişiye göre görev yönetimi</div>
            <div className="text-sm text-[color:var(--text-muted)]">
              İşlem yapmadan önce profili seçin.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {taskUsers.map((user) => {
              const active = taskUserView === user.id;
              return (
                <button
                  key={user.id}
                  onClick={() => setTaskUserView(user.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    active ? "bg-slate-950 text-white" : "bg-white ring-1 ring-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-base">
                      <AvatarDisplay avatar={user.avatar} name={user.name} />
                    </span>
                    <span>{user.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="parent-tasks-layout">
      <Card title={taskDraft.id ? "Görevi düzenle" : "Yeni görev"} description="Kişi, zaman ve harçlık seçin.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_100px]">
            <label className="block space-y-2">
              <Label>Başlık</Label>
              <input
                id="parent-task-title"
                value={taskDraft.title}
                onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
            <label className="block space-y-2">
              <Label>Harçlık</Label>
              <input
                type="number"
                min={5}
                value={taskDraft.points}
                onChange={(event) =>
                  setTaskDraft((current) => ({ ...current, points: Number(event.target.value || 0) }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <Label>Zamanlama</Label>
              <select
                value={taskDraft.scheduleType}
                onChange={(event) =>
                  setTaskDraft((current) => ({
                    ...current,
                    scheduleType: event.target.value as TaskFormPayload["scheduleType"],
                    days: event.target.value === "haftalik" ? current.days : [],
                    specialDates: event.target.value === "ozel" ? current.specialDates : []
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <option value="gunluk">Günlük</option>
                <option value="haftalik">Haftalık</option>
                <option value="ozel">Özel günler</option>
              </select>
            </label>
            <label className="block space-y-2">
              <Label>Zaman dilimi</Label>
              <select
                value={taskDraft.timeBlock}
                onChange={(event) =>
                  setTaskDraft((current) => ({
                    ...current,
                    timeBlock: event.target.value as TaskFormPayload["timeBlock"]
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                {Object.entries(TIME_BLOCK_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {taskDraft.scheduleType === "haftalik" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_PRESETS.map((preset) => {
                  const active = hasSameDays(taskDraft.days, preset.days);
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setTaskDraft((current) => ({ ...current, days: [...preset.days] }))}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_KEYS.map((key) => {
                  const label = WEEKDAY_LABELS[key];
                  const active = taskDraft.days.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setTaskDraft((current) => ({
                          ...current,
                          days: active ? current.days.filter((day) => day !== key) : [...current.days, key]
                        }))
                      }
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        active ? "bg-teal-600 text-white" : "bg-white ring-1 ring-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {taskDraft.scheduleType === "ozel" ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="date"
                  value={specialDate}
                  onChange={(event) => setSpecialDate(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <button
                  onClick={() => {
                    if (!specialDate) {
                      return;
                    }
                    setTaskDraft((current) => ({
                      ...current,
                      specialDates: Array.from(new Set([...current.specialDates, specialDate]))
                    }));
                    setSpecialDate("");
                  }}
                  className="rounded-[1.3rem] bg-slate-200 px-4 py-3 font-semibold"
                >
                  Ekle
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {taskDraft.specialDates.map((date) => (
                  <button
                    key={date}
                    onClick={() =>
                      setTaskDraft((current) => ({
                        ...current,
                        specialDates: current.specialDates.filter((item) => item !== date)
                      }))
                    }
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-slate-200"
                  >
                    {date}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex gap-3">
            <button
              onClick={() => onSaveTask(taskDraft)}
              disabled={working || !selectedTaskUser || !taskDraft.title.trim() || !taskDraft.assignedTo.length}
              className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {taskDraft.id ? "Güncelle" : "Görev ekle"}
            </button>
            <button
              onClick={() => {
                setTaskDraft(createTaskDraft(taskUserView || taskUsers[0]?.id));
                setSpecialDate("");
              }}
              className="rounded-[1.4rem] bg-slate-200 px-5 py-3 font-semibold text-slate-800"
            >
              Temizle
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="Görev listesi"
        description={
          selectedTaskUser
            ? `${selectedTaskUser.name} için görevleri ara, filtrele ve düzenle.`
            : "Önce profil seçin."
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="block w-full lg:max-w-sm">
              <input
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                placeholder="Görev ara"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
            <div className="text-sm font-medium text-[color:var(--text-muted)]">
              {selectedTaskUser ? `${selectedTaskUser.name} için ` : ""}
              {filteredTaskCount} görev
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {TASK_LIST_TIME_FILTERS.map((filter) => {
              const active = taskTimeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setTaskTimeFilter(filter.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          <details className="task-allowance-summary"><summary>Harçlık özeti</summary>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-950">
                  {selectedTaskUser?.name ?? "Profil"} için {formatAllowance(visibleTaskPoints)} görünür
                </span>
                <span>{formatAllowance(selectedTaskUserPotential?.points ?? 0)} bugün kazanabilir</span>
                <span>{selectedTaskUserPotential?.taskCount ?? 0} görev bugün planlı</span>
              </div>
            </div>
          </details>

          <div className="parent-task-table-wrap">
            {filteredTaskGroups.length === 0 ? (
              <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-[color:var(--text-muted)]">
                Bu filtreyle görünen görev yok.
              </div>
            ) : (
              <table className="parent-task-table">
                <thead>
                  <tr>
                    <th>Görev</th>
                    {TASK_TABLE_TIME_BLOCKS.map((block) => (
                      <th key={block.id}>{block.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTaskGroups.map((group) => (
                    <tr key={group.key}>
                      <td className="parent-task-title-cell">
                        <span>
                          <strong>{group.title}</strong>
                          <small>{group.entries.length} zaman planı</small>
                        </span>
                      </td>
                      {TASK_TABLE_TIME_BLOCKS.map((block) => {
                        const blockTasks = group.entries.filter((task) => task.time_block === block.id);
                        return (
                          <td key={block.id}>
                            {blockTasks.length === 0 ? (
                              <span className="parent-task-empty">-</span>
                            ) : (
                              <div className="parent-task-plan-stack">
                                {blockTasks.map((task) => {
                                  const active = taskDraft.id === task.id;
                                  const moveScopeIds = getTaskMoveScopeIds(task);
                                  const moveIndex = moveScopeIds.indexOf(task.id);
                                  return (
                                    <div
                                      key={task.id}
                                      className={`parent-task-plan ${active ? "is-active" : ""}`}
                                    >
                                      <button
                                        type="button"
                                        className="parent-task-plan-main"
                                        onClick={() => loadTaskIntoDraft(task)}
                                      >
                                        <span className="parent-task-plan-points">{formatAllowance(task.points)}</span>
                                        <span>{getTaskScheduleSummary(task)}</span>
                                      </button>
                                      <div className="parent-task-plan-tools">
                                        {canReorderTasks ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => void moveTask(task, -1)}
                                              disabled={working || moveScopeIds.length < 2 || moveIndex === 0}
                                              aria-label="Yukari tasi"
                                            >
                                              <ArrowUp className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => void moveTask(task, 1)}
                                              disabled={
                                                working ||
                                                moveScopeIds.length < 2 ||
                                                moveIndex === moveScopeIds.length - 1
                                              }
                                              aria-label="Asagi tasi"
                                            >
                                              <ArrowDown className="h-3.5 w-3.5" />
                                            </button>
                                          </>
                                        ) : null}
                                        <button
                                          type="button"
                                          disabled={working}
                                          onClick={() => loadTaskIntoDraft(task)}
                                          aria-label="Görevi düzenle"
                                          title="Düzenle"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          className="is-delete"
                                          disabled={working}
                                          aria-label="Görevi sil"
                                          title="Sil"
                                          onClick={async () => {
                                            const names = task.assigned_to
                                              .map((id) => userLookup[id]?.name)
                                              .filter(Boolean)
                                              .join(", ");
                                            if (
                                              !window.confirm(
                                                task.title +
                                                  " (" +
                                                  TIME_BLOCK_LABELS[task.time_block] +
                                                  ") silinsin mi? Bu görev " +
                                                  names +
                                                  " için kaldırılır. Tamamlama kayıtları silinir; kazanılmış harçlık korunur."
                                              )
                                            ) {
                                              return;
                                            }
                                            if (await onDeleteTask(task.id)) {
                                              if (taskDraft.id === task.id) {
                                                setTaskDraft(
                                                  createTaskDraft(taskUserView || taskUsers[0]?.id)
                                                );
                                              }
                                            }
                                          }}
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>
      </div>
    </div>
  );

  const plansTab = (
    <div className="space-y-5">
      <div className="parent-management-toolbar">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-950">Kişiye özel haftalık plan</div>
            <div className="text-sm text-[color:var(--text-muted)]">
              Ders, iş, izin, spor veya serbest ajanda olarak kullanabilirsiniz.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {taskUsers.map((user) => {
              const active = planUserView === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setPlanUserView(user.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    active ? "bg-slate-950 text-white" : "bg-white ring-1 ring-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-base">
                      <AvatarDisplay avatar={user.avatar} name={user.name} />
                    </span>
                    <span>{user.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Card
        title="Haftalık plan tablosu"
        description={
          selectedPlanUser
            ? `${selectedPlanUser.name} için hücrelere ders, iş, izin, spor veya not yazın.`
            : "Önce profil seçin."
        }
      >
        <div className="space-y-4">
          <div className="parent-plan-summary">
            <div>
              <span>Profil</span>
              <strong>{selectedPlanUser?.name ?? "Seçilmedi"}</strong>
            </div>
            <div>
              <span>Dolu hücre</span>
              <strong>{selectedPlanCount}</strong>
            </div>
          </div>

          <div className="parent-plan-table-wrap">
            <table className="parent-plan-table">
              <thead>
                <tr>
                  <th>Satır / saat</th>
                  {PLAN_WEEKDAYS.map((weekday) => (
                    <th key={weekday}>{PLAN_WEEKDAY_LABELS[weekday]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEFAULT_PLAN_SLOTS.map((slot) => (
                  <tr key={slot.slotIndex}>
                    <th>
                      <input
                        value={planDraft.slots[slot.slotIndex]?.label ?? slot.label}
                        onChange={(event) =>
                          setPlanDraft((current) => ({
                            ...current,
                            slots: {
                              ...current.slots,
                              [slot.slotIndex]: {
                                ...(current.slots[slot.slotIndex] ?? slot),
                                label: event.target.value
                              }
                            }
                          }))
                        }
                        className="parent-plan-row-input"
                        aria-label="Satır adı"
                      />
                      <div className="parent-plan-time-fields">
                        <input
                          type="time"
                          value={planDraft.slots[slot.slotIndex]?.startTime ?? slot.startTime}
                          onChange={(event) =>
                            setPlanDraft((current) => ({
                              ...current,
                              slots: {
                                ...current.slots,
                                [slot.slotIndex]: {
                                  ...(current.slots[slot.slotIndex] ?? slot),
                                  startTime: event.target.value
                                }
                              }
                            }))
                          }
                          aria-label="Başlangıç saati"
                        />
                        <input
                          type="time"
                          value={planDraft.slots[slot.slotIndex]?.endTime ?? slot.endTime}
                          onChange={(event) =>
                            setPlanDraft((current) => ({
                              ...current,
                              slots: {
                                ...current.slots,
                                [slot.slotIndex]: {
                                  ...(current.slots[slot.slotIndex] ?? slot),
                                  endTime: event.target.value
                                }
                              }
                            }))
                          }
                          aria-label="Bitiş saati"
                        />
                      </div>
                    </th>
                    {PLAN_WEEKDAYS.map((weekday) => (
                      <td key={weekday}>
                        <input
                          value={planDraft.cells[weekday]?.[slot.slotIndex] ?? ""}
                          onChange={(event) =>
                            setPlanDraft((current) => ({
                              ...current,
                              cells: {
                                ...current.cells,
                                [weekday]: {
                                  ...current.cells[weekday],
                                  [slot.slotIndex]: event.target.value
                                }
                              }
                            }))
                          }
                          placeholder="Plan"
                          className="parent-plan-input"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => selectedPlanUser ? onSaveProfilePlan(buildProfilePlanPayload(selectedPlanUser.id, planDraft)) : undefined}
              disabled={working || !selectedPlanUser}
              className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              Planı kaydet
            </button>
            <button
              type="button"
              onClick={() => setPlanDraft(createEmptyProfilePlanDraft())}
              disabled={working || !selectedPlanUser}
              className="rounded-[1.4rem] bg-slate-200 px-5 py-3 font-semibold text-slate-800 disabled:opacity-60"
            >
              Tabloyu temizle
            </button>
          </div>
        </div>
      </Card>
    </div>
  );

  const pointsTab = (
    <div className="max-w-3xl">
      <Card title="Hesap hareketi" description="Ekstra para ekleyin veya yapılan harcamayı düşürün.">
        <div className="space-y-4">
          <label className="block space-y-2">
            <Label>Profil</Label>
            <div className="flex flex-wrap gap-2">
              {data?.users.map((user) => {
                const active = pointsUserId === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setPointsUserId(user.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      active ? "bg-slate-950 text-white" : "bg-white ring-1 ring-slate-200"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-base">
                        <AvatarDisplay avatar={user.avatar} name={user.name} />
                      </span>
                      <span>{user.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </label>
          <label className="block space-y-2">
            <Label>Tutar</Label>
            <input
              type="text"
              inputMode="numeric"
              value={pointsDeltaInput}
              onChange={(event) => {
                const nextValue = event.target.value.replace(",", ".");

                if (/^-?\d*$/.test(nextValue)) {
                  setPointsDeltaInput(nextValue);
                }
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <div className="space-y-2">
            <Label>Hızlı tutar seç</Label>
            <div className="space-y-2">
              {[POINT_ADD_PRESETS, POINT_SPEND_PRESETS].map((presetGroup, groupIndex) => (
                <div key={groupIndex} className="grid grid-cols-5 gap-2">
                  {presetGroup.map((delta) => {
                    const active = parsedPointsDelta === delta;
                    const negative = delta < 0;

                    return (
                      <button
                        key={delta}
                        type="button"
                        onClick={() => setPointsDeltaInput(String(delta))}
                        className={`min-w-0 rounded-full px-3 py-2 text-sm font-semibold transition ${
                          active
                            ? negative
                              ? "bg-rose-600 text-white"
                              : "bg-emerald-600 text-white"
                            : negative
                              ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                              : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        }`}
                      >
                        {delta > 0 ? `+${formatAllowance(delta)}` : formatAllowance(delta)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="text-xs text-[color:var(--text-muted)]">
              Artı tutar hesaba eklenir, eksi tutar harcama olarak düşülür.
            </div>
          </div>
          <label className="block space-y-2">
            <Label>Açıklama</Label>
            <input
              value={pointsNote}
              onChange={(event) => setPointsNote(event.target.value)}
              placeholder="Bayram harçlığı, oyuncak harcaması, hediye para..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <button
            onClick={() => {
              if (!canSubmitPoints || parsedPointsDelta === null) {
                return;
              }

              onAdjustPoints(pointsUserId, parsedPointsDelta, pointsNote);
            }}
            disabled={working || !pointsUserId || !canSubmitPoints}
            className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            Hareketi kaydet
          </button>
        </div>
      </Card>
    </div>
  );

  const historyTab = (
    <div className="space-y-5">
      <div className="parent-management-toolbar">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-950">Geçmiş kontrolü</div>
            <div className="text-sm text-[color:var(--text-muted)]">
              Bir profil ve gün seçin; yapılan ve kalan görevleri tek ekranda görün.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {data?.users.map((user) => {
              const active = historyUserId === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setHistoryUserId(user.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    active ? "bg-slate-950 text-white" : "bg-white ring-1 ring-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-base">
                      <AvatarDisplay avatar={user.avatar} name={user.name} />
                    </span>
                    <span>{user.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Card
        title="Gün özeti"
        description={
          selectedHistoryUser && selectedHistoryDay
            ? `${selectedHistoryUser.name} / ${selectedHistoryDay.detail}`
            : "Profil ve gün seçin."
        }
      >
        <div className="space-y-5">
          <div className="flex gap-2 overflow-x-auto pb-1 soft-scrollbar">
            {historyDays.map((day) => {
              const active = selectedHistoryDay?.dateKey === day.dateKey;
              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => setHistoryDateKey(day.dateKey)}
                  className={`shrink-0 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                    active ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
                  }`}
                >
                  <span className="block">{day.label}</span>
                  <span className={`block text-xs ${active ? "text-white/70" : "text-slate-500"}`}>{day.detail}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Görev</div>
              <div className="mt-2 text-2xl font-bold text-slate-950">
                {completedHistoryTasks.length}/{historyTasks.length}
              </div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Kazanç</div>
              <div className="mt-2 text-2xl font-bold text-emerald-700">{formatAllowance(historyEarnedPoints)}</div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Planlanan</div>
              <div className="mt-2 text-2xl font-bold text-slate-950">{formatAllowance(historyPotentialPoints)}</div>
            </div>
          </div>

          {historyTasks.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-[color:var(--text-muted)]">
              Bu gün için planlı görev görünmüyor.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white">
              <div className="grid grid-cols-[1fr_130px_120px] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                <span>Görev</span>
                <span>Zaman</span>
                <span>Durum</span>
              </div>
              <div className="divide-y divide-slate-100">
                {historyTasks.map((task) => {
                  const completion = getCompletionForTask(
                    data?.completions ?? [],
                    task.id,
                    selectedHistoryUser?.id ?? "",
                    selectedHistoryDay?.dateKey ?? ""
                  );
                  const completed = Boolean(completion);

                  return (
                    <div
                      key={task.id}
                      className="grid grid-cols-[1fr_130px_120px] items-center gap-3 px-4 py-3 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-slate-950">{task.title}</div>
                        <div className="text-xs text-[color:var(--text-muted)]">{formatAllowance(completion?.points_earned ?? task.points)}</div>
                      </div>
                      <div className="text-slate-600">{TIME_BLOCK_LABELS[task.time_block]}</div>
                      <div>
                        {completed ? (
                          <button
                            type="button"
                            disabled={working || !selectedHistoryUser || !selectedHistoryDay}
                            onClick={() =>
                              selectedHistoryUser && selectedHistoryDay
                                ? onUndoTaskCompletion(
                                    task.id,
                                    selectedHistoryUser.id,
                                    selectedHistoryDay.dateKey,
                                    task.title
                                  )
                                : undefined
                            }
                            className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100 disabled:opacity-60"
                            title="Yanlış işaretlendiyse geri al"
                          >
                            ✓ Yapıldı
                          </button>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500">
                            Bekliyor
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );

  const settingsTab = (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card title="Aile ayarları" description="Aile adı ve sesli geri bildirimi yönetin.">
        <div className="space-y-4">
          <label className="block space-y-2">
            <Label>Aile adı</Label>
            <input
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <label className="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4">
            <div>
              <div className="font-semibold">Sesli geri bildirim açık</div>
              <div className="text-sm text-[color:var(--text-muted)]">Görevlerde ses ve tebrik oynatılır.</div>
            </div>
            <input
              type="checkbox"
              checked={audioEnabled}
              onChange={(event) => setAudioEnabled(event.target.checked)}
              className="h-5 w-5"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSaveSettings}
              disabled={working}
              className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              Ayarları kaydet
            </button>
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        <Card title="Güvenlik" description="Hesap şifresini ve yönetim PIN'ini buradan güncelle.">
          <div className="space-y-5">
            <div className="space-y-4 rounded-[1.6rem] border border-slate-200 bg-white/70 p-4">
              <div>
                <div className="text-base font-semibold">Hesap şifresi</div>
                <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                  {data?.session.username ? `${data.session.username} hesabının giriş şifresini değiştir.` : "Giriş şifresini değiştir."}
                </div>
              </div>
              <label className="block space-y-2">
                <Label>Mevcut şifre</Label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  autoComplete="current-password"
                />
              </label>
              <label className="block space-y-2">
                <Label>Yeni şifre</Label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  autoComplete="new-password"
                />
              </label>
              <label className="block space-y-2">
                <Label>Yeni şifre tekrar</Label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  autoComplete="new-password"
                />
              </label>
              <button
                onClick={handleChangePassword}
                disabled={working}
                className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
              >
                Şifreyi güncelle
              </button>
            </div>

            <div className="space-y-4 rounded-[1.6rem] border border-slate-200 bg-white/70 p-4">
              <div>
                <div className="text-base font-semibold">Yönetim PIN&apos;i</div>
                <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                  Yönetim paneline girişte kullanılan PIN&apos;i değiştir.
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block space-y-2">
                  <Label>Mevcut PIN</Label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={currentPin}
                    onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  />
                </label>
                <label className="block space-y-2">
                  <Label>Yeni PIN</Label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  />
                </label>
                <label className="block space-y-2">
                  <Label>Yeni PIN tekrar</Label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  />
                </label>
              </div>
              <button
                onClick={handleChangePin}
                disabled={working}
                className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
              >
                PIN&apos;i güncelle
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  const activeTabContent = tab === "kullanicilar"
    ? usersTab
    : tab === "gorevler"
      ? tasksTab
      : tab === "planlar"
        ? plansTab
        : tab === "harcliklar"
          ? pointsTab
          : tab === "gecmis"
            ? historyTab
            : settingsTab;

  const body = !data?.session.parentAuthenticated
    ? lockedView
    : (
      <div className="parent-command-layout">
        <aside className="parent-command-sidebar">
          <div className="parent-command-family">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">Yönetim paneli</div>
            <strong>{data.family?.name}</strong>
            <span>Aile ayarları ve görev sistemi</span>
          </div>
          <div className="parent-command-tabs">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`parent-command-tab ${
                  tab === item.id
                    ? "is-active"
                    : ""
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="parent-command-content">
          {activeTabContent}
        </div>
      </div>
    );

  const panelShell = (
    <div className="parent-command-shell">
      <div className="parent-command-header">
        <div className="parent-command-title">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">Yönetim paneli</div>
          <div className="text-xl font-semibold sm:text-2xl">Aile kontrol merkezi</div>
        </div>
        {!standalone ? (
          <button
            onClick={onClose}
            className="parent-command-close"
          >
            Kapat
          </button>
        ) : null}
      </div>
      <div className="parent-command-scroll soft-scrollbar">{body}</div>
    </div>
  );

  if (standalone) {
    return (
      <div className="parent-command-page">
        <div className="parent-command-page-inner">
          {panelShell}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-950/24"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="fixed inset-0 z-50 bg-transparent p-0 sm:p-3 lg:p-4"
          >
            <div className="mx-auto h-full w-full max-w-[1600px]">{panelShell}</div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
