"use client";

import {
  type ComponentType,
  type CSSProperties,
  startTransition,
  useEffect,
  useMemo,
  useState
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Expand,
  Lock,
  LogOut,
  MoonStar,
  PanelRightOpen,
  PartyPopper,
  RefreshCw,
  Star
} from "lucide-react";
import { DEFAULT_TASK_ICON } from "@/lib/task-defaults";
import { AccountScreen } from "@/components/kiosk/account-screen";
import { AvatarDisplay } from "@/components/kiosk/avatar-display";
import { CelebrationLayer } from "@/components/kiosk/celebration-layer";
import { DaySummaryPanel } from "@/components/kiosk/day-summary-panel";
import { ParentPanel } from "@/components/kiosk/parent-panel";
import { PinModal } from "@/components/kiosk/pin-modal";
import { SetupScreen } from "@/components/kiosk/setup-screen";
import { playSuccessAudio } from "@/lib/client-audio";
import {
  formatPointsAsValue,
  getRewardSystemConfig,
  getVisibleRewards,
  rewardModeUsesGoals,
  rewardModeUsesValue
} from "@/lib/reward-system";
import {
  getActiveTimeBlock,
  getDateKey,
  getDigitalTimeLabel,
  getTasksForUserOnDate,
  isTaskCompleted
} from "@/lib/schedule";
import type { ActiveTimeBlock, SetupPayload, TaskRecord, TimeBlock } from "@/lib/types";
import { useDashboardStore } from "@/stores/use-dashboard-store";

interface KioskAppProps {
  mode: "dashboard" | "yonetim";
}

type KidScreen = "profiles" | "tasks";

interface UtilityButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void | Promise<void>;
  emphasis?: boolean;
}

interface TabletActionButtonProps extends UtilityButtonProps {
  className?: string;
}

interface EmptyTaskState {
  icon: ComponentType<{ className?: string }>;
  kicker: string;
  title: string;
  copy: string;
  nextLabel?: string;
}

async function setupRequest(payload: SetupPayload) {
  const response = await fetch("/api/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(data.error || "Kurulum yapilamadi.");
  }
}

function orderTasks(tasks: TaskRecord[]) {
  const order = { sabah: 1, ogleden_sonra: 2, aksam: 3, her_zaman: 4 } as const;
  return [...tasks].sort((a, b) => {
    const timeOrder = order[a.time_block] - order[b.time_block];
    if (timeOrder !== 0) {
      return timeOrder;
    }

    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });
}

const ACTIVE_BLOCK_ORDER: Record<Exclude<ActiveTimeBlock, "gece">, number> = {
  sabah: 1,
  ogleden_sonra: 2,
  aksam: 3
};

const SCHEDULED_BLOCK_ORDER: Record<Exclude<TimeBlock, "her_zaman">, number> = {
  sabah: 1,
  ogleden_sonra: 2,
  aksam: 3
};

const TASK_GROUP_ORDER: TimeBlock[] = ["sabah", "ogleden_sonra", "aksam", "her_zaman"];

function getTurkishBlockLabel(block: ActiveTimeBlock | TimeBlock) {
  switch (block) {
    case "sabah":
      return "Sabah";
    case "ogleden_sonra":
      return "Öğleden sonra";
    case "aksam":
      return "Akşam";
    case "gece":
      return "Gece";
    default:
      return "Gün boyu";
  }
}

function isTaskVisibleForCurrentBlock(taskBlock: TimeBlock, currentBlock: ActiveTimeBlock) {
  if (currentBlock === "gece") {
    return false;
  }

  if (taskBlock === "her_zaman") {
    return true;
  }

  return SCHEDULED_BLOCK_ORDER[taskBlock] <= ACTIVE_BLOCK_ORDER[currentBlock];
}

function getNextFutureBlockLabel(tasks: TaskRecord[]) {
  const nextTask = [...tasks].sort((a, b) => {
    const aOrder = a.time_block === "her_zaman" ? 99 : SCHEDULED_BLOCK_ORDER[a.time_block];
    const bOrder = b.time_block === "her_zaman" ? 99 : SCHEDULED_BLOCK_ORDER[b.time_block];
    return aOrder - bOrder;
  }).find((task) => task.time_block !== "her_zaman");

  return nextTask ? getTurkishBlockLabel(nextTask.time_block) : null;
}

export function getEmptyTaskState(args: {
  currentDayPart: ActiveTimeBlock;
  allTodayTasks: TaskRecord[];
  availableNowTasks: TaskRecord[];
  incompleteTodayTasks: TaskRecord[];
  futureTodayTasks: TaskRecord[];
}): EmptyTaskState {
  const {
    currentDayPart,
    allTodayTasks,
    availableNowTasks,
    incompleteTodayTasks,
    futureTodayTasks
  } = args;
  const nextBlockLabel = getNextFutureBlockLabel(futureTodayTasks);

  if (allTodayTasks.length === 0) {
    return {
      icon: Star,
      kicker: "Bugün hafif",
      title: "Bu profil için bugün görev yok",
      copy: "Bugünlük pano sakin. İstersen başka bir profile geçebilir ya da keyfine bakabilirsin."
    };
  }

  if (currentDayPart === "gece" && incompleteTodayTasks.length === 0) {
    return {
      icon: MoonStar,
      kicker: "Günün yıldızı",
      title: "Bravo! Bugün bütün görevler tamam.",
      copy: "Sabahı, öğleden sonrayı ve akşamı harika bitirdin. Bugünü süper kapattın."
    };
  }

  if (availableNowTasks.length > 0 && incompleteTodayTasks.length !== allTodayTasks.length) {
    const stageLabel = getTurkishBlockLabel(currentDayPart);
    const stageLabelLower = stageLabel.toLocaleLowerCase("tr-TR");

    if (futureTodayTasks.length > 0 && nextBlockLabel) {
      return {
        icon: PartyPopper,
        kicker: `${stageLabel} tamam`,
        title: `Süpersin! ${stageLabel} görevlerinin hepsi bitti.`,
        copy: `${nextBlockLabel} görevleri daha sonra açılacak. Şimdi biraz dinlen, sonra yine gel.`,
        nextLabel: `Sırada: ${nextBlockLabel}`
      };
    }

    return {
      icon: PartyPopper,
      kicker: "Harika gidiyorsun",
      title: `Bravo! ${stageLabel} bölümü tamam.`,
      copy:
        currentDayPart === "aksam"
          ? "Bu akşamki görevlerin bitti. Gece olunca bugünün büyük kutlaması da gelecek."
          : `Şu an için ${stageLabelLower} bölümü kapandı. Sonra tekrar uğrayabilirsin.`
    };
  }

  if (futureTodayTasks.length > 0 && nextBlockLabel) {
    return {
      icon: Clock3,
      kicker: "Biraz sonra yeni tur",
      title: `${nextBlockLabel} turu daha sonra başlayacak`,
      copy: "Şimdilik burada bekleme zamanı. Yeni görevler açılınca tekrar gel.",
      nextLabel: `Sonraki bölüm: ${nextBlockLabel}`
    };
  }

  return {
    icon: CheckCircle2,
    kicker: "Şimdilik tamam",
    title: "Burada şu an yeni görev yok",
    copy: "Biraz sonra yeniden kontrol edebilir ya da başka bir profile geçebilirsin."
  };
}

function withAlpha(color: string, alpha: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}${alpha}` : color;
}

function getProfileTheme(color: string) {
  const key = color.trim().toLowerCase();

  if (key === "#ff8a65") {
    return {
      primary: "#FB7185",
      secondary: "#C084FC",
      accent: "#FDBA74",
      soft: "rgba(251, 113, 133, 0.18)",
      softStrong: "rgba(251, 113, 133, 0.28)",
      glow: "rgba(251, 113, 133, 0.34)",
      text: "#4A1633"
    };
  }

  if (key === "#60a5fa") {
    return {
      primary: "#38BDF8",
      secondary: "#6366F1",
      accent: "#A78BFA",
      soft: "rgba(56, 189, 248, 0.18)",
      softStrong: "rgba(56, 189, 248, 0.28)",
      glow: "rgba(56, 189, 248, 0.34)",
      text: "#102A58"
    };
  }

  if (key === "#2dd4bf") {
    return {
      primary: "#2DD4BF",
      secondary: "#22C55E",
      accent: "#FACC15",
      soft: "rgba(45, 212, 191, 0.18)",
      softStrong: "rgba(45, 212, 191, 0.28)",
      glow: "rgba(45, 212, 191, 0.34)",
      text: "#0A3E3A"
    };
  }

  return {
    primary: color,
    secondary: "#8B5CF6",
    accent: "#FACC15",
    soft: withAlpha(color, "22"),
    softStrong: withAlpha(color, "33"),
    glow: withAlpha(color, "55"),
    text: "#132238"
  };
}

function UtilityButton({ icon: Icon, label, onClick, emphasis }: UtilityButtonProps) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`kid-utility-button ${emphasis ? "kid-utility-button-dark" : ""}`}
    >
      <Icon className="h-5 w-5" />
      <span className="kid-utility-label hidden text-sm sm:inline">{label}</span>
    </button>
  );
}

function TabletActionButton({
  icon: Icon,
  label,
  onClick,
  emphasis,
  className = ""
}: TabletActionButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`kid-tablet-action-button ${emphasis ? "kid-tablet-action-button-dark" : ""} ${className}`.trim()}
    >
      <Icon className="h-5 w-5 shrink-0" />
    </button>
  );
}

function getDayPartMeta(timeBlock: TaskRecord["time_block"]) {
  switch (timeBlock) {
    case "sabah":
      return {
        emoji: "🌅",
        label: "Sabah",
        className: "kid-daypart-pill-sabah"
      };
    case "ogleden_sonra":
      return {
        emoji: "🌞",
        label: "Ogleden Sonra",
        className: "kid-daypart-pill-ogleden"
      };
    case "aksam":
      return {
        emoji: "🌙",
        label: "Aksam",
        className: "kid-daypart-pill-aksam"
      };
    default:
      return {
        emoji: "⭐",
        label: "Gun Boyu",
        className: "kid-daypart-pill-sabah"
      };
  }
}

function getCompactDayPartChipClasses(timeBlock: TimeBlock) {
  switch (timeBlock) {
    case "sabah":
      return "bg-sky-100/88 text-sky-900 ring-1 ring-white/75";
    case "ogleden_sonra":
      return "bg-amber-100/88 text-amber-950 ring-1 ring-white/75";
    case "aksam":
      return "bg-indigo-100/88 text-indigo-900 ring-1 ring-white/75";
    default:
      return "bg-emerald-100/88 text-emerald-900 ring-1 ring-white/75";
  }
}

function getTaskGroupTone(timeBlock: TimeBlock, isCurrent: boolean) {
  const tones = {
    sabah: {
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,249,255,0.98) 58%, rgba(186,230,253,0.82) 100%)",
      border: isCurrent ? "rgba(56,189,248,0.42)" : "rgba(125,211,252,0.34)",
      shadow: isCurrent ? "0 18px 36px rgba(14,165,233,0.16)" : "0 14px 30px rgba(125,211,252,0.12)",
      badgeBg: "rgba(14,165,233,0.10)",
      badgeText: "#0c4a6e"
    },
    ogleden_sonra: {
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,251,235,0.98) 58%, rgba(253,230,138,0.80) 100%)",
      border: isCurrent ? "rgba(245,158,11,0.42)" : "rgba(252,211,77,0.34)",
      shadow: isCurrent ? "0 18px 36px rgba(245,158,11,0.15)" : "0 14px 30px rgba(252,211,77,0.12)",
      badgeBg: "rgba(245,158,11,0.10)",
      badgeText: "#92400e"
    },
    aksam: {
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(238,242,255,0.98) 58%, rgba(199,210,254,0.82) 100%)",
      border: isCurrent ? "rgba(99,102,241,0.42)" : "rgba(129,140,248,0.34)",
      shadow: isCurrent ? "0 18px 36px rgba(99,102,241,0.15)" : "0 14px 30px rgba(129,140,248,0.12)",
      badgeBg: "rgba(99,102,241,0.10)",
      badgeText: "#3730a3"
    },
    her_zaman: {
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.98) 58%, rgba(167,243,208,0.82) 100%)",
      border: isCurrent ? "rgba(16,185,129,0.40)" : "rgba(52,211,153,0.32)",
      shadow: isCurrent ? "0 18px 36px rgba(16,185,129,0.14)" : "0 14px 30px rgba(52,211,153,0.11)",
      badgeBg: "rgba(16,185,129,0.10)",
      badgeText: "#065f46"
    }
  } as const;

  return tones[timeBlock];
}

function getActiveDayPartMeta(timeBlock: ActiveTimeBlock) {
  if (timeBlock === "gece") {
    return {
      label: "Gece",
      className: "kid-daypart-pill-gece"
    };
  }

  return getDayPartMeta(timeBlock);
}

export function KioskApp({ mode }: KioskAppProps) {
  const [screen, setScreen] = useState<KidScreen>("profiles");
  const [clockNow, setClockNow] = useState<Date | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const {
    data,
    activeProfileId,
    loading,
    working,
    pendingTaskKeys,
    error,
    toast,
    celebration,
    loginOpen,
    adminOpen,
    loadDashboard,
    setActiveProfile,
    openLogin,
    closeLogin,
    openAdmin,
    closeAdmin,
    clearToast,
    clearCelebration,
    loginAccount,
    registerAccount,
    logoutAccount,
    loginParent,
    logoutParent,
    completeTask,
    undoTaskCompletion,
    saveUser,
    saveTask,
    reorderTasks,
    saveReward,
    resolveRedemption,
    adjustPoints,
    resetProgress,
    updateFamilySettings
  } = useDashboardStore();

  useEffect(() => {
    startTransition(() => {
      void loadDashboard();
    });

    const interval = window.setInterval(() => {
      startTransition(() => {
        void loadDashboard();
      });
    }, 60000);

    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    const tickClock = () => {
      setClockNow(new Date());
    };

    tickClock();
    const interval = window.setInterval(tickClock, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(clearToast, 2400);
    return () => window.clearTimeout(timeout);
  }, [toast, clearToast]);

  useEffect(() => {
    if (celebration && toast?.kind === "basari") {
      clearToast();
    }
  }, [celebration, toast, clearToast]);

  useEffect(() => {
    if (!celebration || !data?.family?.audio_enabled) {
      return;
    }
    const userName = data.users.find((user) => user.id === celebration.userId)?.name;
    void playSuccessAudio(userName);
  }, [celebration, data?.family?.audio_enabled, data?.users]);

  const allUsers = useMemo(() => data?.users ?? [], [data?.users]);
  const profileUsers = useMemo(() => allUsers, [allUsers]);
  const profileGridColumns = useMemo(
    () => Math.min(Math.max(profileUsers.length, 1), 5),
    [profileUsers.length]
  );
  const profileGridStyle = useMemo(
    () =>
      ({
        "--kid-profile-columns": String(profileGridColumns)
      }) as CSSProperties,
    [profileGridColumns]
  );
  const referenceNow = useMemo(() => clockNow ?? new Date(), [clockNow]);

  const selectedUser = useMemo(() => {
    if (!data) {
      return null;
    }

    return (
      profileUsers.find((user) => user.id === activeProfileId) ??
      profileUsers[0] ??
      null
    );
  }, [activeProfileId, data, profileUsers]);

  const todayDateKey = useMemo(
    () => (data ? getDateKey(referenceNow, data.family) : ""),
    [data, referenceNow]
  );
  const realCurrentDayPart = useMemo(
    () =>
      data
        ? getActiveTimeBlock(referenceNow, data.family, selectedUser?.role)
        : "sabah",
    [data, referenceNow, selectedUser?.role]
  );
  const familyCurrentDayPart = useMemo(
    () => (data ? getActiveTimeBlock(referenceNow, data.family, "ebeveyn") : "sabah"),
    [data, referenceNow]
  );
  const currentDayPart = realCurrentDayPart;

  const allTodayTasks = useMemo(() => {
    if (!data || !selectedUser) {
      return [];
    }

    return orderTasks(
      getTasksForUserOnDate(
        data.tasks,
        selectedUser.id,
        todayDateKey,
        referenceNow,
        data.family
      )
    );
  }, [data, referenceNow, selectedUser, todayDateKey]);

  const incompleteTodayTasks = useMemo(() => {
    if (!data || !selectedUser) {
      return [];
    }

    return orderTasks(
      allTodayTasks.filter(
        (task) =>
          !isTaskCompleted(data.completions, task.id, selectedUser.id, todayDateKey)
      )
    );
  }, [allTodayTasks, data, selectedUser, todayDateKey]);

  const todayTasks = useMemo(
    () =>
      orderTasks(
        incompleteTodayTasks.filter((task) =>
          isTaskVisibleForCurrentBlock(task.time_block, currentDayPart)
        )
      ),
    [currentDayPart, incompleteTodayTasks]
  );

  const visibleTodayTasks = useMemo(
    () =>
      orderTasks(
        allTodayTasks.filter((task) =>
          isTaskVisibleForCurrentBlock(task.time_block, currentDayPart)
        )
      ),
    [allTodayTasks, currentDayPart]
  );

  const groupedTodayTasks = useMemo(
    () =>
      TASK_GROUP_ORDER.map((block) => ({
        block,
        tasks: todayTasks.filter((task) => task.time_block === block),
        totalCount: visibleTodayTasks.filter((task) => task.time_block === block).length
      })).filter((group) => group.totalCount > 0),
    [todayTasks, visibleTodayTasks]
  );

  const defaultOpenTaskGroup = useMemo(() => {
    if (currentDayPart !== "gece" && groupedTodayTasks.some((group) => group.block === currentDayPart)) {
      return currentDayPart;
    }

    if (groupedTodayTasks.some((group) => group.block === "her_zaman")) {
      return "her_zaman" as TimeBlock;
    }

    return groupedTodayTasks[0]?.block ?? null;
  }, [currentDayPart, groupedTodayTasks]);

  const [expandedTaskGroup, setExpandedTaskGroup] = useState<TimeBlock | null>(null);

  useEffect(() => {
    setExpandedTaskGroup(defaultOpenTaskGroup);
  }, [selectedUser?.id, todayDateKey, defaultOpenTaskGroup]);

  const celebrationUser =
    celebration && data
      ? allUsers.find((user) => user.id === celebration.userId) ?? null
      : null;
  const rewardSystemConfig = useMemo(() => getRewardSystemConfig(data?.rewards ?? []), [data?.rewards]);
  const visibleRewards = useMemo(() => getVisibleRewards(data?.rewards ?? []), [data?.rewards]);
  const rewardModeShowsGoals = rewardModeUsesGoals(rewardSystemConfig.mode);
  const rewardModeShowsValue = rewardModeUsesValue(rewardSystemConfig.mode);
  const sortedVisibleRewards = useMemo(
    () => [...visibleRewards].sort((left, right) => left.points_required - right.points_required),
    [visibleRewards]
  );
  const nextRewardGoal = useMemo(() => {
    if (!selectedUser || !rewardModeShowsGoals || sortedVisibleRewards.length === 0) {
      return null;
    }

    return (
      sortedVisibleRewards.find((reward) => reward.points_required > selectedUser.points) ??
      sortedVisibleRewards[sortedVisibleRewards.length - 1] ??
      null
    );
  }, [rewardModeShowsGoals, selectedUser, sortedVisibleRewards]);
  const convertedPointsValue = useMemo(() => {
    if (!selectedUser || !rewardModeShowsValue) {
      return null;
    }

    return formatPointsAsValue(selectedUser.points, rewardSystemConfig);
  }, [rewardModeShowsValue, rewardSystemConfig, selectedUser]);
  const nextRewardProgressRatio = useMemo(() => {
    if (!nextRewardGoal || nextRewardGoal.points_required <= 0 || !selectedUser) {
      return 0;
    }

    return Math.min(selectedUser.points / nextRewardGoal.points_required, 1);
  }, [nextRewardGoal, selectedUser]);
  const rewardInsightCount = Number(rewardModeShowsValue) + Number(rewardModeShowsGoals && nextRewardGoal);
  const shouldShowRewardInsights =
    rewardSystemConfig.mode !== "puan" && (rewardModeShowsValue || (rewardModeShowsGoals && nextRewardGoal));
  const compactScorePill = (
    <div className="kid-score-pill bg-white/78 text-slate-900 ring-1 ring-white/90 shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200/95 text-amber-700 shadow-[0_10px_20px_rgba(15,23,42,0.12)]">
        <Star className="h-5 w-5 fill-current" />
      </span>
      <span className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-slate-500">
        Toplam
      </span>
      <span className="text-lg font-black tracking-[-0.03em]">
        {selectedUser?.points ?? 0}
      </span>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="app-surface flex min-h-screen items-center justify-center">
        <div className="glass-panel-strong rounded-[2rem] px-8 py-6 text-lg font-semibold">
          Veriler hazirlaniyor...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="app-surface flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel-strong max-w-xl rounded-[2rem] p-8 text-center">
          <h1 className="text-3xl font-semibold">Baslangicta hata olustu</h1>
          <p className="mt-3 text-[color:var(--text-muted)]">{error}</p>
          <button
            onClick={() => void loadDashboard()}
            className="mt-5 rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white"
          >
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  if (data?.setupRequired) {
    return (
      <SetupScreen
        working={working}
        username={data.session.username}
        errorMessage={setupError ?? (toast?.kind === "hata" ? toast.message : null)}
        onSubmit={async (payload) => {
          clearToast();
          setSetupError(null);

          try {
            await setupRequest(payload);
            await loadDashboard();
          } catch (error) {
            setSetupError(error instanceof Error ? error.message : "Kurulum yapilamadi.");
          }
        }}
        onLogout={async () => {
          clearToast();
          setSetupError(null);
          await logoutAccount();
        }}
      />
    );
  }

  if (data?.authRequired) {
    return (
      <AccountScreen
        working={working}
        errorMessage={toast?.kind === "hata" ? toast.message : null}
        onLogin={async (payload) => {
          await loginAccount(payload);
        }}
        onRegister={async (payload) => {
          await registerAccount(payload);
        }}
      />
    );
  }

  if (!data) {
    return null;
  }

  if (!selectedUser) {
    return (
      <>
        <div className="app-surface flex min-h-screen items-center justify-center p-6">
          <div className="glass-panel-strong max-w-xl rounded-[2rem] p-8 text-center">
            <h1 className="text-3xl font-semibold">Profiller bulunamadi</h1>
            <p className="mt-3 text-[color:var(--text-muted)]">
              Kullanici listesi bos. Supabase senkronizasyonunu yenileyip tekrar dene.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {allUsers.length > 0 ? (
                <button
                  onClick={() => {
                    if (data.session.parentAuthenticated) {
                      openAdmin();
                      return;
                    }

                    openLogin();
                  }}
                  className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white"
                >
                  {data.session.parentAuthenticated ? "Yonetimi ac" : "Yonetim girisi"}
                </button>
              ) : null}
              <button
                onClick={() => void loadDashboard()}
                className="rounded-[1.4rem] bg-slate-200 px-5 py-3 font-semibold text-slate-800"
              >
                Tekrar dene
              </button>
              <button
                onClick={async () => {
                  setScreen("profiles");
                  closeAdmin();
                  closeLogin();
                  await logoutAccount();
                }}
                className="rounded-[1.4rem] bg-white px-5 py-3 font-semibold text-slate-700 ring-1 ring-slate-200"
              >
                Bu hesaptan cik
              </button>
            </div>
          </div>
        </div>

        <PinModal
          open={loginOpen}
          working={working}
          onClose={closeLogin}
          onSubmit={async (pin) => {
            await loginParent(pin);
          }}
        />

        <ParentPanel
          open={adminOpen}
          data={data}
          working={working}
          onClose={logoutParent}
          onOpenLogin={openLogin}
          onSaveUser={saveUser}
          onSaveTask={saveTask}
          onReorderTasks={reorderTasks}
          onSaveReward={saveReward}
          onResolveRedemption={resolveRedemption}
          onAdjustPoints={adjustPoints}
          onUndoTaskCompletion={undoTaskCompletion}
          onResetProgress={resetProgress}
          onUpdateSettings={updateFamilySettings}
          onLogout={logoutParent}
        />
      </>
    );
  }

  const themeClass = data.family?.theme === "koyu" ? "theme-koyu" : "";
  const selectedTheme = getProfileTheme(selectedUser.color);
  const dayPart = getActiveDayPartMeta(familyCurrentDayPart);
  const digitalClock = clockNow ? getDigitalTimeLabel(clockNow) : null;
  const dashboardThemeStyle = {
    "--active-primary": selectedTheme.primary,
    "--active-secondary": selectedTheme.secondary,
    "--active-accent": selectedTheme.accent,
    "--active-soft": selectedTheme.soft,
    "--active-soft-strong": selectedTheme.softStrong,
    "--active-glow": selectedTheme.glow,
    "--active-text": selectedTheme.text
  } as CSSProperties;

  if (mode === "yonetim") {
    return (
      <div className={`app-surface ${themeClass}`}>
        <ParentPanel
          open
          standalone
          data={data}
          working={working}
          onClose={() => undefined}
          onOpenLogin={openLogin}
          onSaveUser={saveUser}
          onSaveTask={saveTask}
          onReorderTasks={reorderTasks}
          onSaveReward={saveReward}
          onResolveRedemption={resolveRedemption}
          onAdjustPoints={adjustPoints}
          onUndoTaskCompletion={undoTaskCompletion}
          onResetProgress={resetProgress}
          onUpdateSettings={updateFamilySettings}
          onLogout={logoutParent}
        />
        <PinModal
          open={loginOpen}
          working={working}
          onClose={closeLogin}
          onSubmit={async (pin) => {
            await loginParent(pin);
          }}
        />
      </div>
    );
  }

  const backButton: UtilityButtonProps | null = screen === "tasks"
    ? {
        icon: ArrowLeft,
        label: "Profiller",
        onClick: () => {
          clearToast();
          setScreen("profiles");
        }
      }
    : null;

  const secondaryButtons: UtilityButtonProps[] = [
    {
      icon: RefreshCw,
      label: "Yenile",
      onClick: () => {
        void loadDashboard();
      }
    },
    {
      icon: Expand,
      label: "Tam ekran",
      onClick: () => {
        void (async () => {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
          }

          await document.documentElement.requestFullscreen();
        })();
      }
    },
    {
      icon: data.session.parentAuthenticated ? PanelRightOpen : Lock,
      label: data.session.parentAuthenticated ? "Yonetim" : "Yonetim",
      onClick: () => {
        if (data.session.parentAuthenticated) {
          openAdmin();
          return;
        }

        openLogin();
      },
      emphasis: true
    },
    {
      icon: LogOut,
      label: "Cikis",
      onClick: async () => {
        setScreen("profiles");
        closeAdmin();
        closeLogin();
        await logoutAccount();
      }
    }
  ];

  const utilityButtons: UtilityButtonProps[] = [
    ...(backButton ? [backButton] : []),
    ...secondaryButtons
  ];

  return (
    <div
      className={`app-surface kiosk-shell ${themeClass} relative overflow-hidden`}
      style={dashboardThemeStyle}
    >
      <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-[var(--active-soft-strong)] blur-[90px]" />
      <div className="pointer-events-none absolute right-[-4rem] top-[-2rem] h-80 w-80 rounded-full bg-[color:var(--active-glow)]/40 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-[-4rem] left-1/3 h-72 w-72 rounded-full bg-amber-200/40 blur-[110px]" />

      <div className="kid-floating-actions fixed right-4 top-4 z-[60] flex flex-col gap-3 lg:right-6 lg:top-6">
        {utilityButtons.map((button) => (
          <UtilityButton key={button.label} {...button} />
        ))}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {screen === "profiles" ? (
          <motion.main
            key="profiles"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="kid-profiles-screen mx-auto flex min-h-screen max-w-[1480px] items-start px-4 py-4 lg:px-6 lg:py-5"
          >
            <section className="kid-screen-panel kid-profiles-panel glass-panel-strong relative w-full overflow-hidden rounded-[3.2rem] p-6 sm:p-7 lg:p-8">
              <div className="pointer-events-none absolute right-[-6rem] top-[-6rem] h-52 w-52 rounded-full bg-[var(--active-soft-strong)] blur-[78px]" />
              <div className="pointer-events-none absolute bottom-[-6rem] left-[-4rem] h-56 w-56 rounded-full bg-amber-200/30 blur-[84px]" />
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

              <div className="kid-profiles-header relative">
                <div className="kid-profiles-title-wrap">
                  <h1 className="kid-family-title kid-page-title mt-2 text-center text-6xl font-black tracking-[-0.08em] sm:text-7xl lg:text-[6.2rem]">
                    {data.family?.name}
                  </h1>
                </div>
                <div className="kid-profiles-header-side mt-4 flex justify-center gap-3 md:absolute md:right-8 md:top-4 md:mt-0 md:justify-end lg:right-10 lg:top-6">
                  <div className="kid-tablet-inline-actions kid-tablet-inline-actions-profile">
                    {secondaryButtons.map((button) => (
                      <TabletActionButton key={button.label} {...button} />
                    ))}
                  </div>
                  <div className="kid-daypart-slot flex justify-center md:justify-end">
                    <div className={`kid-daypart-pill ${dayPart.className}`}>
                      <span className="kid-daypart-illustration" aria-hidden="true">
                        <span className="kid-daypart-orb" />
                        <span className="kid-daypart-orb-core" />
                        <span className="kid-daypart-accent kid-daypart-accent-a" />
                        <span className="kid-daypart-accent kid-daypart-accent-b" />
                        <span className="kid-daypart-horizon" />
                        <span className="kid-daypart-star" />
                      </span>
                      <span className="kid-daypart-copy">
                        <span className="kid-daypart-label">{dayPart.label}</span>
                        <span className="kid-daypart-time" suppressHydrationWarning>
                          {digitalClock ?? "--:--"}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="kid-profile-grid relative mt-8 grid gap-4"
                data-profile-count={profileGridColumns}
                style={profileGridStyle}
              >
                {profileUsers.map((user, index) => {
                  const userTheme = getProfileTheme(user.color);
                  const roleLabel = user.role === "ebeveyn" ? "Ebeveyn" : "Cocuk";

                  return (
                    <motion.button
                      key={user.id}
                      initial={{ opacity: 0, y: 22 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.24, ease: "easeOut" }}
                      whileHover={{ y: -6, scale: 1.01 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => {
                        setActiveProfile(user.id);
                        clearToast();
                        setScreen("tasks");
                      }}
                      className="kid-profile-card relative overflow-hidden rounded-[2.8rem] p-6 text-left text-white"
                      style={{
                        backgroundImage: `linear-gradient(150deg, ${userTheme.primary} 0%, ${userTheme.secondary} 70%, ${userTheme.accent} 145%)`,
                        boxShadow: `0 28px 60px ${userTheme.glow}`,
                        borderColor: withAlpha(userTheme.accent, "38")
                      }}
                    >
                      <div className="pointer-events-none absolute -right-6 top-0 h-32 w-32 rounded-full bg-white/16 blur-2xl" />
                      <div className="pointer-events-none absolute bottom-[-2rem] left-[-2rem] h-32 w-32 rounded-full bg-black/10 blur-2xl" />
                      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/85 to-transparent" />
                      <div className="kid-profile-score kid-profile-score-floating">
                        <div className="flex items-center justify-center gap-2 text-amber-200">
                          <Star className="h-5 w-5 fill-amber-200" />
                          <span className="kid-profile-score-label text-[0.7rem] font-black uppercase tracking-[0.2em] text-white/82">
                            Puan
                          </span>
                        </div>
                        <div className="kid-profile-score-value mt-2 text-[2.15rem] font-black tracking-[-0.06em] leading-none text-white">
                          {user.points}
                        </div>
                      </div>
                      <div className="kid-profile-card-body relative">
                        <div className="kid-profile-card-top flex items-start gap-3">
                          <div className="kid-profile-avatar overflow-hidden text-[3.8rem]">
                            <AvatarDisplay avatar={user.avatar} name={user.name} />
                          </div>
                        </div>
                        <div className="kid-profile-name mt-9 text-[2.85rem] font-black tracking-[-0.06em] leading-[0.95]">
                          {user.name}
                        </div>
                        <div className="mt-5 flex flex-wrap gap-3">
                          <div className="kid-profile-chip">{roleLabel}</div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          </motion.main>
        ) : (
          <motion.main
            key={`tasks-${selectedUser.id}`}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="kid-tasks-screen mx-auto min-h-screen max-w-[1480px] px-4 py-3 lg:px-6 lg:py-5"
          >
            <section
              className="kid-stage-card kid-tasks-stage relative overflow-hidden rounded-[3rem] p-6 lg:p-8"
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 100%), linear-gradient(150deg, ${withAlpha(selectedTheme.primary, "D9")} 0%, ${withAlpha(selectedTheme.secondary, "C4")} 72%, ${withAlpha(selectedTheme.accent, "AE")} 145%)`,
                boxShadow: `0 24px 58px ${selectedTheme.glow}, inset 0 1px 0 rgba(255,255,255,0.16)`,
                border: `1px solid ${withAlpha(selectedTheme.accent, "30")}`
              }}
            >
              <div className="pointer-events-none absolute -left-10 top-0 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
              <div className="pointer-events-none absolute bottom-[-3rem] right-[-1rem] h-52 w-52 rounded-full bg-amber-200/12 blur-3xl" />
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/65 to-transparent" />

              <div className="kid-tasks-stage-header relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="kid-tasks-stage-profile flex items-center gap-4">
                  <div className="kid-profile-avatar overflow-hidden text-[3.8rem] text-white">
                    <AvatarDisplay avatar={selectedUser.avatar} name={selectedUser.name} />
                  </div>
                  <div className="text-white">
                    <h1 className="kid-tasks-stage-title text-4xl font-black tracking-[-0.07em] sm:text-[3.35rem]">
                      {selectedUser.name}
                    </h1>
                  </div>
                </div>

                <div className="kid-tasks-stage-side flex flex-wrap items-center gap-3">
                  <div className="kid-tablet-inline-actions kid-tablet-inline-actions-task">
                    {utilityButtons.map((button) => (
                      <TabletActionButton
                        key={button.label}
                        {...button}
                        className={button.label === "Profiller" ? "kid-tablet-back-button" : ""}
                      />
                    ))}
                  </div>
                  {!shouldShowRewardInsights ? (
                    <div className="kid-score-pill bg-white/16 text-white ring-1 ring-white/18">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200/95 text-amber-700 shadow-[0_10px_20px_rgba(15,23,42,0.16)]">
                        <Star className="h-5 w-5 fill-current" />
                      </span>
                      <span className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-white/72">
                        Toplam
                      </span>
                      <span className="text-lg font-black tracking-[-0.03em]">
                        {selectedUser.points}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {shouldShowRewardInsights ? (
              <section className={`mt-4 grid gap-3 ${rewardInsightCount > 1 ? "lg:grid-cols-2" : ""}`}>
                {rewardModeShowsValue ? (
                  <div
                    className="relative overflow-hidden rounded-[2rem] px-5 py-5 text-slate-950 backdrop-blur-xl"
                    style={{
                      backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.92) 38%, ${withAlpha(selectedTheme.primary, "16")} 100%), linear-gradient(135deg, ${withAlpha(selectedTheme.primary, "22")} 0%, ${withAlpha(selectedTheme.secondary, "18")} 60%, ${withAlpha(selectedTheme.accent, "1F")} 100%)`,
                      border: `1px solid ${withAlpha(selectedTheme.primary, "30")}`,
                      boxShadow: `0 18px 42px ${withAlpha(selectedTheme.secondary, "18")}`
                    }}
                  >
                    <div className="pointer-events-none absolute -left-10 top-[-2rem] h-36 w-36 rounded-full blur-3xl" style={{ background: withAlpha(selectedTheme.primary, "30") }} />
                    <div className="pointer-events-none absolute bottom-[-3rem] right-[-1rem] h-40 w-40 rounded-full blur-3xl" style={{ background: withAlpha(selectedTheme.accent, "28") }} />
                    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.5rem] text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)]"
                          style={{
                            backgroundImage: `linear-gradient(145deg, ${selectedTheme.primary} 0%, ${selectedTheme.secondary} 78%, ${selectedTheme.accent} 140%)`
                          }}
                        >
                          <Star className="h-8 w-8 fill-current" />
                        </div>
                        <div>
                          <div className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-slate-500">
                            Birikimin
                          </div>
                          <div className="mt-1 text-4xl font-black tracking-[-0.06em] sm:text-[2.8rem]">
                            {convertedPointsValue}
                          </div>
                          <div className="mt-2 text-sm font-medium text-slate-600">
                            Gorevlerle biriktirdigin toplam deger
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-center sm:self-center">
                        {compactScorePill}
                      </div>
                    </div>
                  </div>
                ) : null}

                {rewardModeShowsGoals && nextRewardGoal ? (
                  <div
                    className="relative overflow-hidden rounded-[2rem] px-5 py-5 text-slate-950 backdrop-blur-xl"
                    style={{
                      backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.92) 34%, ${withAlpha(selectedTheme.accent, "14")} 100%), linear-gradient(135deg, ${withAlpha(selectedTheme.secondary, "1C")} 0%, ${withAlpha(selectedTheme.primary, "16")} 72%, ${withAlpha(selectedTheme.accent, "24")} 100%)`,
                      border: `1px solid ${withAlpha(selectedTheme.secondary, "2E")}`,
                      boxShadow: `0 18px 42px ${withAlpha(selectedTheme.primary, "15")}`
                    }}
                  >
                    <div className="pointer-events-none absolute right-[-1.5rem] top-[-2.5rem] h-36 w-36 rounded-full blur-3xl" style={{ background: withAlpha(selectedTheme.secondary, "24") }} />
                    <div className="pointer-events-none absolute bottom-[-3rem] left-[-1rem] h-36 w-36 rounded-full blur-3xl" style={{ background: withAlpha(selectedTheme.accent, "22") }} />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.2rem] text-white shadow-[0_12px_24px_rgba(15,23,42,0.14)]"
                          style={{
                            backgroundImage: `linear-gradient(145deg, ${selectedTheme.secondary} 0%, ${selectedTheme.primary} 74%, ${selectedTheme.accent} 140%)`
                          }}
                        >
                          <PartyPopper className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-slate-500">
                            Sonraki hedef
                          </div>
                          <div className="mt-1 text-2xl font-black tracking-[-0.05em]">
                            {nextRewardGoal.title}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {selectedUser.points >= nextRewardGoal.points_required
                              ? "Hedefe ulastin, artik odul isteyebilirsin."
                              : `${Math.max(nextRewardGoal.points_required - selectedUser.points, 0)} puan daha kaldi.`}
                          </div>
                        </div>
                      </div>
                      <div
                        className="rounded-full px-3 py-1 text-sm font-semibold"
                        style={{
                          background: withAlpha(selectedTheme.secondary, "12"),
                          color: selectedTheme.text,
                          boxShadow: `inset 0 0 0 1px ${withAlpha(selectedTheme.secondary, "28")}`
                        }}
                      >
                        {selectedUser.points} / {nextRewardGoal.points_required} puan
                      </div>
                    </div>
                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80 ring-1 ring-slate-200/80">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          background: `linear-gradient(90deg, ${selectedTheme.primary} 0%, ${selectedTheme.secondary} 100%)`,
                          width: `${selectedUser.points > 0 ? Math.max(nextRewardProgressRatio * 100, 8) : 0}%`
                        }}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span className="rounded-full bg-white/82 px-3 py-1 ring-1 ring-white/90">
                        Hedef ilerlemesi %{Math.round(nextRewardProgressRatio * 100)}
                      </span>
                      <span className="rounded-full bg-white/82 px-3 py-1 ring-1 ring-white/90">
                        {nextRewardGoal.points_required} puanda acilir
                      </span>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {todayTasks.length === 0 ? (
              <DaySummaryPanel
                user={selectedUser}
                family={data.family}
                currentDayPart={currentDayPart}
                allTodayTasks={allTodayTasks}
                completions={data.completions}
                dateKey={todayDateKey}
                dateLabel={data.today.label}
                weekday={data.today.weekday}
                theme={selectedTheme}
              />
            ) : (
              <section className="mt-5 space-y-5">
                {groupedTodayTasks.map((group) => {
                  const dayPart = getDayPartMeta(group.block);
                  const completedCount = group.totalCount - group.tasks.length;
                  const isExpanded = expandedTaskGroup === group.block;
                  const isCurrentGroup = currentDayPart !== "gece" && group.block === currentDayPart;
                  const groupTone = getTaskGroupTone(group.block, isCurrentGroup);

                  return (
                    <section key={group.block} className="space-y-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTaskGroup((current) => (current === group.block ? null : group.block))
                        }
                        className="relative flex w-full flex-col gap-3 overflow-hidden rounded-[1.8rem] px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                        style={{
                          backgroundImage: groupTone.background,
                          border: `1px solid ${groupTone.border}`,
                          boxShadow: groupTone.shadow
                        }}
                      >
                        <div className="pointer-events-none absolute -left-8 top-[-2rem] h-24 w-24 rounded-full blur-3xl" style={{ background: groupTone.badgeBg }} />
                        <div className="pointer-events-none absolute bottom-[-2rem] right-[-1rem] h-24 w-24 rounded-full blur-3xl" style={{ background: groupTone.badgeBg }} />

                        <div className="relative flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                          <div
                            className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-sm font-black tracking-[-0.02em] ${getCompactDayPartChipClasses(group.block)}`}
                          >
                            <span aria-hidden="true">{dayPart.emoji}</span>
                            <span>{dayPart.label}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isCurrentGroup ? (
                              <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.14em] text-white">
                                Simdi
                              </span>
                            ) : null}
                            <span
                              className="rounded-full px-3 py-1 text-xs font-semibold"
                              style={{ background: groupTone.badgeBg, color: groupTone.badgeText }}
                            >
                              {completedCount === group.totalCount ? "Bolum tamam" : "Bugunun akisi"}
                            </span>
                          </div>
                        </div>

                        <div className="relative flex items-center justify-between gap-3 sm:justify-end">
                          <div className="flex flex-wrap justify-end gap-2">
                            <span
                              className="rounded-full px-3 py-1.5 text-sm font-semibold"
                              style={{ background: "rgba(255,255,255,0.76)", color: groupTone.badgeText }}
                            >
                              {completedCount}/{group.totalCount} tamam
                            </span>
                            <span
                              className="rounded-full px-3 py-1.5 text-sm font-semibold"
                              style={{ background: groupTone.badgeBg, color: groupTone.badgeText }}
                            >
                              {group.tasks.length > 0 ? `${group.tasks.length} acik gorev` : "Acik gorev yok"}
                            </span>
                          </div>
                          <ChevronDown
                            className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                            style={{ color: groupTone.badgeText }}
                          />
                        </div>
                      </button>

                      <AnimatePresence initial={false}>
                        {isExpanded ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            {group.tasks.length > 0 ? (
                              <div
                                className={`kid-task-grid ${group.tasks.length > 1 ? "kid-task-grid-multi" : ""} grid gap-4 pt-1`}
                              >
                                {group.tasks.map((task, index) => {
                                  const taskActionKey = `${task.id}:${selectedUser.id}:${todayDateKey}`;
                                  const pendingTask = pendingTaskKeys.includes(taskActionKey);
                                  const completed = isTaskCompleted(
                                    data.completions,
                                    task.id,
                                    selectedUser.id,
                                    todayDateKey
                                  );

                                  return (
                                    <motion.article
                                      key={task.id}
                                      initial={{ opacity: 0, y: 18 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: index * 0.03, duration: 0.22, ease: "easeOut" }}
                                      className="kid-task-card glass-panel relative overflow-hidden"
                                      style={{
                                        backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, ${selectedTheme.soft} 62%, ${withAlpha(selectedTheme.accent, "18")} 100%)`,
                                        borderColor: withAlpha(selectedTheme.primary, "2E")
                                      }}
                                    >
                                      <div className="pointer-events-none absolute right-[-2rem] top-[-2rem] h-32 w-32 rounded-full bg-[var(--active-soft)] blur-3xl" />
                                      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/85 to-transparent" />
                                      <div className="kid-task-layout relative flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                        <div className="kid-task-main flex min-w-0 flex-1 items-center">
                                          <div
                                            className="kid-task-icon shrink-0 text-white"
                                            style={{
                                              backgroundImage: `linear-gradient(150deg, ${selectedTheme.primary} 0%, ${selectedTheme.secondary} 76%, ${selectedTheme.accent} 145%)`,
                                              boxShadow: `0 18px 34px ${selectedTheme.glow}`
                                            }}
                                          >
                                            {task.icon || DEFAULT_TASK_ICON}
                                          </div>

                                          <div className="kid-task-copy min-w-0 flex-1">
                                            <div className="kid-task-copy-row flex items-center justify-between gap-2">
                                              <h2 className="kid-task-title min-w-0 flex-1 font-black tracking-[-0.04em] text-[color:var(--text-main)]">
                                                {task.title}
                                              </h2>
                                              <div className="kid-points-badge kid-points-badge-task shrink-0 whitespace-nowrap">
                                                <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
                                                {task.points}
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="kid-task-action-wrap">
                                          <button
                                            disabled={pendingTask || completed}
                                            aria-label={
                                              pendingTask
                                                ? "Isleniyor"
                                                : completed
                                                  ? "Tamamlandi"
                                                  : "Tamamla"
                                            }
                                            onClick={() =>
                                              completeTask(
                                                task.id,
                                                selectedUser.id,
                                                todayDateKey,
                                                task.title,
                                                task.points
                                              )
                                            }
                                            className="kid-complete-button kid-complete-button-inline"
                                          >
                                            {pendingTask ? (
                                              <span className="kid-complete-button-content">
                                                <RefreshCw className="h-6 w-6 animate-spin" />
                                                <span className="kid-complete-label">Isleniyor</span>
                                              </span>
                                            ) : (
                                              <span className="kid-complete-button-content">
                                                <span className="kid-complete-glyph">
                                                  <Check className="h-7 w-7 stroke-[3.2]" />
                                                </span>
                                                <span className="kid-complete-label">Tamamla</span>
                                              </span>
                                            )}
                                          </button>
                                        </div>
                                      </div>
                                    </motion.article>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="glass-panel rounded-[2rem] px-5 py-4 text-sm font-semibold text-white/78">
                                Bu bolumde acik gorev kalmadi. Istersen diger bolumu acabilirsin.
                              </div>
                            )}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </section>
                  );
                })}
              </section>
            )}
          </motion.main>
        )}
      </AnimatePresence>

      <CelebrationLayer
        open={Boolean(celebration)}
        userName={celebrationUser?.name ?? selectedUser.name}
        userAvatar={celebrationUser?.avatar ?? selectedUser.avatar}
        taskTitle={celebration?.taskTitle ?? ""}
        points={celebration?.points ?? 0}
        totalPoints={celebrationUser?.points ?? selectedUser.points}
        onDone={clearCelebration}
      />

      <PinModal
        open={loginOpen}
        working={working}
        onClose={closeLogin}
        onSubmit={async (pin) => {
          await loginParent(pin);
        }}
      />

      <ParentPanel
        open={adminOpen}
        data={data}
        working={working}
        onClose={logoutParent}
        onOpenLogin={openLogin}
        onSaveUser={saveUser}
        onSaveTask={saveTask}
        onReorderTasks={reorderTasks}
        onSaveReward={saveReward}
        onResolveRedemption={resolveRedemption}
        onAdjustPoints={adjustPoints}
        onUndoTaskCompletion={undoTaskCompletion}
        onResetProgress={resetProgress}
        onUpdateSettings={updateFamilySettings}
        onLogout={logoutParent}
      />

      {toast ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`fixed bottom-5 left-1/2 z-[65] -translate-x-1/2 rounded-full px-5 py-3 text-sm font-semibold shadow-panel ${
            toast.kind === "hata"
              ? "bg-rose-600 text-white"
              : toast.kind === "basari"
                ? "bg-emerald-600 text-white"
                : "bg-slate-950 text-white"
          }`}
        >
          {toast.message}
        </motion.div>
      ) : null}
    </div>
  );
}
