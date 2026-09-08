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
import Image from "next/image";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Expand,
  Home,
  Lock,
  LogOut,
  PanelRightOpen,
  RefreshCw,
  Settings,
  Users
} from "lucide-react";
import { formatAllowance } from "@/lib/allowance";
import { AccountScreen } from "@/components/kiosk/account-screen";
import { AvatarDisplay } from "@/components/kiosk/avatar-display";
import { ParentPanel } from "@/components/kiosk/parent-panel";
import { PinModal } from "@/components/kiosk/pin-modal";
import { SetupScreen } from "@/components/kiosk/setup-screen";
import {
  getActiveTimeBlock,
  getDateKey,
  getDigitalTimeLabel,
  getTasksForUserOnDate,
  isTaskCompleted
} from "@/lib/schedule";
import type {
  ActiveTimeBlock,
  CompletionRecord,
  FamilyRecord,
  SetupPayload,
  TaskRecord,
  TimeBlock,
  UserRecord
} from "@/lib/types";
import { useDashboardStore } from "@/stores/use-dashboard-store";

interface KioskAppProps {
  mode: "dashboard" | "yonetim";
}

type DashboardView = "home" | "profiles";

interface NavAction {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void | Promise<void>;
  active?: boolean;
  emphasis?: boolean;
}

interface MemberStats {
  user: UserRecord;
  tasks: TaskRecord[];
  visibleTasks: TaskRecord[];
  completedCount: number;
  openCount: number;
  todayAllowance: number;
  earnedToday: number;
  openAllowance: number;
  progress: number;
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
    throw new Error(data.error || "Kurulum yapılamadı.");
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

function getMemberAccent(color: string) {
  const key = color.trim().toLowerCase();

  if (key === "#ff8a65") {
    return "#f97316";
  }

  if (key === "#60a5fa") {
    return "#0ea5e9";
  }

  if (key === "#2dd4bf") {
    return "#14b8a6";
  }

  return color || "#2563eb";
}

function DashboardNav({ actions }: { actions: NavAction[] }) {
  return (
    <aside className="command-sidebar">
      <div className="command-brand">
        <Home className="h-5 w-5" />
      </div>
      <nav className="command-nav">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <button
              key={action.label}
              type="button"
              title={action.label}
              aria-label={action.label}
              onClick={action.onClick}
              className={`command-nav-button ${action.active ? "is-active" : ""} ${action.emphasis ? "is-emphasis" : ""}`}
            >
              <Icon className="h-5 w-5" />
              <span>{action.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function DashboardHeader({
  family,
  dateLabel,
  weekday,
  clock,
  dayPart,
  actions
}: {
  family: FamilyRecord | null;
  dateLabel: string;
  weekday: string;
  clock: string;
  dayPart: ActiveTimeBlock;
  actions: NavAction[];
}) {
  return (
    <header className="command-header">
      <div className="command-title-lockup">
        <div className="command-title-mark" aria-hidden="true">
          <Image src="/aile-panosu-logo.png" alt="" width={44} height={44} priority />
        </div>
        <h1>{family?.name ?? "Aile Panosu"}</h1>
      </div>
      <div className="command-header-metrics">
        <div className="command-clock" suppressHydrationWarning>
          {clock}
        </div>
        <div className="command-metric command-date-metric">
          <CalendarDays className="h-4 w-4" />
          <span>{weekday}, {dateLabel}</span>
        </div>
        <div className="command-metric">
          <Clock3 className="h-4 w-4" />
          <span>{getTurkishBlockLabel(dayPart)}</span>
        </div>
        <div className="command-header-actions">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.label}
                type="button"
                title={action.label}
                aria-label={action.label}
                onClick={action.onClick}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

function TodayOverview({
  stats,
  selectedUser,
  onSelect
}: {
  stats: MemberStats[];
  selectedUser: UserRecord;
  onSelect: (userId: string) => void;
}) {
  return (
    <section className="command-today">
      <div className="command-section-heading">
        <span>Bugün</span>
        <strong>Aile merkezi</strong>
      </div>
      <div className="command-family-strip">
        {stats.map((item) => {
          const accent = getMemberAccent(item.user.color);
          const selected = item.user.id === selectedUser.id;

          return (
            <button
              key={item.user.id}
              type="button"
              onClick={() => onSelect(item.user.id)}
              className={`command-member-row ${selected ? "is-selected" : ""}`}
              style={{ "--member-accent": accent } as CSSProperties}
            >
              <span className="command-member-avatar">
                <AvatarDisplay avatar={item.user.avatar} name={item.user.name} />
              </span>
              <span className="command-member-copy">
                <span className="command-member-name">{item.user.name}</span>
                <span className="command-member-status">
                  {item.openCount === 0 ? "Tüm görevler tamam" : `${item.openCount} açık görev`}
                </span>
              </span>
              <span
                className={`command-member-state ${item.openCount === 0 ? "is-done" : "is-open"}`}
                aria-label={item.openCount === 0 ? "Görevler tamam" : "Bekleyen görev var"}
                title={item.openCount === 0 ? "Görevler tamam" : "Bekleyen görev var"}
              >
                {item.openCount === 0 ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProfilesDirectory({
  stats,
  selectedUser,
  completions,
  dateKey,
  pendingTaskKeys,
  onSelect,
  onComplete,
  onUndo
}: {
  stats: MemberStats[];
  selectedUser: UserRecord;
  completions: CompletionRecord[];
  dateKey: string;
  pendingTaskKeys: string[];
  onSelect: (userId: string) => void;
  onComplete: (task: TaskRecord) => void;
  onUndo: (task: TaskRecord) => void;
}) {
  const selectedStats = stats.find((item) => item.user.id === selectedUser.id) ?? stats[0] ?? null;

  if (!selectedStats) {
    return null;
  }

  const accent = getMemberAccent(selectedStats.user.color);
  const groupedTasks = TASK_GROUP_ORDER.map((block) => {
    const tasks = selectedStats.visibleTasks.filter((task) => task.time_block === block);
    const completedCount = tasks.filter((task) =>
      isTaskCompleted(completions, task.id, selectedStats.user.id, dateKey)
    ).length;

    return {
      block,
      tasks,
      completedCount
    };
  }).filter((group) => group.tasks.length > 0);

  return (
    <section className="command-profiles-view">
      <div className="command-profiles-list">
        <div className="command-section-heading">
          <span>Profiller</span>
          <strong>Aile üyeleri</strong>
        </div>
        <div className="command-profile-cards">
          {stats.map((item) => {
            const itemAccent = getMemberAccent(item.user.color);
            const selected = item.user.id === selectedStats.user.id;

            return (
              <button
                key={item.user.id}
                type="button"
                className={`command-profile-card ${selected ? "is-selected" : ""}`}
                style={{ "--member-accent": itemAccent } as CSSProperties}
                onClick={() => onSelect(item.user.id)}
              >
                <span className="command-profile-card-avatar">
                  <AvatarDisplay avatar={item.user.avatar} name={item.user.name} />
                </span>
                <span className="command-profile-card-copy">
                  <strong>{item.user.name}</strong>
                </span>
                <span className={`command-profile-card-state ${item.openCount === 0 ? "is-done" : ""}`}>
                  {item.openCount === 0 ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <article className="command-profile-detail" style={{ "--member-accent": accent } as CSSProperties}>
        <div className="command-profile-detail-head">
          <div className="command-profile-detail-avatar">
            <AvatarDisplay avatar={selectedStats.user.avatar} name={selectedStats.user.name} />
          </div>
          <div className="command-profile-detail-title">
            <h2>{selectedStats.user.name}</h2>
          </div>
        </div>

        <div className="command-profile-detail-stats">
          <div>
            <span>Bugünkü durum</span>
            <strong>{selectedStats.openCount === 0 ? "Tamam" : "Bekliyor"}</strong>
          </div>
          <div>
            <span>Görev</span>
            <strong>{selectedStats.completedCount}/{selectedStats.tasks.length}</strong>
          </div>
          <div>
            <span>Toplam harçlık</span>
            <strong>{formatAllowance(selectedStats.user.points)}</strong>
          </div>
        </div>

        <div className="command-profile-detail-tasks">
          <div className="command-section-heading">
            <span>Bugün</span>
            <strong>{selectedStats.user.name} görevleri</strong>
          </div>
          {groupedTasks.length === 0 ? (
            <div className="command-profile-empty">Bugün için görünen görev yok.</div>
          ) : (
            groupedTasks.map((group) => (
              <div key={group.block} className="command-profile-task-group">
                <div className="command-profile-task-group-head">
                  <strong>{getTurkishBlockLabel(group.block)}</strong>
                  <span>
                    {group.completedCount}/{group.tasks.length} tamam
                  </span>
                </div>
                {group.tasks.map((task) => {
                  const completed = isTaskCompleted(completions, task.id, selectedStats.user.id, dateKey);
                  const pending = pendingTaskKeys.includes(`${task.id}:${selectedStats.user.id}:${dateKey}`);

                  return (
                    <article key={task.id} className={`command-profile-task ${completed ? "is-complete" : ""}`}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => (completed ? onUndo(task) : onComplete(task))}
                        className="command-profile-task-check"
                        aria-label={completed ? "Görevi geri al" : "Görevi tamamla"}
                      >
                        {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : completed ? <Check className="h-5 w-5" /> : null}
                      </button>
                      <strong>{task.title}</strong>
                      <span className="command-profile-task-meta">
                        <b>{formatAllowance(task.points)}</b>
                      </span>
                    </article>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}

export function KioskApp({ mode }: KioskAppProps) {
  const [clockNow, setClockNow] = useState<Date | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [dashboardView, setDashboardView] = useState<DashboardView>("home");
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
    deleteUser,
    saveTask,
    reorderTasks,
    adjustPoints,
    resetProgress,
    updateFamilySettings,
    changeAccountPassword,
    changeParentPin
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
    if (!celebration) {
      return;
    }
    clearCelebration();
  }, [celebration, clearCelebration]);

  const referenceNow = useMemo(() => clockNow ?? new Date(), [clockNow]);
  const allUsers = useMemo(() => data?.users ?? [], [data?.users]);
  const selectedUser = useMemo(() => {
    if (!data) {
      return null;
    }

    return allUsers.find((user) => user.id === activeProfileId) ?? allUsers[0] ?? null;
  }, [activeProfileId, allUsers, data]);

  const todayDateKey = useMemo(
    () => (data ? getDateKey(referenceNow, data.family) : ""),
    [data, referenceNow]
  );

  const familyCurrentDayPart = useMemo(
    () => (data ? getActiveTimeBlock(referenceNow, data.family, "ebeveyn") : "sabah"),
    [data, referenceNow]
  );

  const memberStats = useMemo<MemberStats[]>(() => {
    if (!data) {
      return [];
    }

    return allUsers.map((user) => {
      const tasks = orderTasks(
        getTasksForUserOnDate(data.tasks, user.id, todayDateKey, referenceNow, data.family)
      );
      const visibleTasks = orderTasks(
        tasks.filter((task) => isTaskVisibleForCurrentBlock(task.time_block, familyCurrentDayPart))
      );
      const completedCount = tasks.filter((task) =>
        isTaskCompleted(data.completions, task.id, user.id, todayDateKey)
      ).length;
      const openCount = Math.max(tasks.length - completedCount, 0);
      const todayAllowance = tasks.reduce((total, task) => total + task.points, 0);
      const earnedToday = tasks
        .filter((task) => isTaskCompleted(data.completions, task.id, user.id, todayDateKey))
        .reduce((total, task) => total + task.points, 0);
      const openAllowance = Math.max(todayAllowance - earnedToday, 0);
      const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 100;

      return {
        user,
        tasks,
        visibleTasks,
        completedCount,
        openCount,
        todayAllowance,
        earnedToday,
        openAllowance,
        progress
      };
    });
  }, [allUsers, data, familyCurrentDayPart, referenceNow, todayDateKey]);

  const selectedStats = useMemo(
    () => memberStats.find((item) => item.user.id === selectedUser?.id) ?? null,
    [memberStats, selectedUser?.id]
  );

  if (loading && !data) {
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

  if (error && !data) {
    return (
      <div className="command-loading">
        <div className="command-error-panel">
          <h1>Başlangıçta hata oluştu</h1>
          <p>{error}</p>
          <button onClick={() => void loadDashboard()}>Tekrar dene</button>
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
            setSetupError(error instanceof Error ? error.message : "Kurulum yapılamadı.");
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

  if (!selectedUser || !selectedStats) {
    return (
      <>
        <div className="command-loading">
          <div className="command-error-panel">
            <h1>Profiller bulunamadı</h1>
            <p>Kullanıcı listesi boş. Yönetimden profil ekleyip tekrar dene.</p>
            <button onClick={() => void loadDashboard()}>Tekrar dene</button>
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
      </>
    );
  }

  if (mode === "yonetim") {
    return (
      <div className="command-admin-surface">
        <ParentPanel
          open
          standalone
          data={data}
          working={working}
          onClose={() => undefined}
          onOpenLogin={openLogin}
          onSaveUser={saveUser}
          onDeleteUser={deleteUser}
          onSaveTask={saveTask}
          onReorderTasks={reorderTasks}
          onAdjustPoints={adjustPoints}
          onUndoTaskCompletion={undoTaskCompletion}
          onResetProgress={resetProgress}
          onUpdateSettings={updateFamilySettings}
          onChangeAccountPassword={changeAccountPassword}
          onChangeParentPin={changeParentPin}
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

  const navActions: NavAction[] = [
    {
      icon: Home,
      label: "Ana sayfa",
      active: dashboardView === "home",
      onClick: () => {
        setDashboardView("home");
        void loadDashboard();
      }
    },
    {
      icon: Users,
      label: "Profiller",
      active: dashboardView === "profiles",
      onClick: () => {
        setDashboardView("profiles");
        const firstUser = allUsers[0];
        if (firstUser) {
          setActiveProfile(firstUser.id);
        }
      }
    },
    {
      icon: data.session.parentAuthenticated ? PanelRightOpen : Lock,
      label: "Yönetim",
      emphasis: true,
      onClick: () => {
        if (data.session.parentAuthenticated) {
          openAdmin();
          return;
        }

        openLogin();
      }
    }
  ];

  const quickActions: NavAction[] = [
    {
      icon: RefreshCw,
      label: "Yenile",
      onClick: () => void loadDashboard()
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
      icon: Settings,
      label: "Ayarlar",
      onClick: () => {
        if (data.session.parentAuthenticated) {
          openAdmin();
          return;
        }

        openLogin();
      }
    },
    {
      icon: LogOut,
      label: "Çıkış",
      onClick: async () => {
        closeAdmin();
        closeLogin();
        await logoutAccount();
      }
    }
  ];

  const selectedAccent = getMemberAccent(selectedUser.color);
  const digitalClock = clockNow ? getDigitalTimeLabel(clockNow) : "--:--";

  return (
    <div
      className="command-surface"
      style={{ "--selected-accent": selectedAccent } as CSSProperties}
    >
      <DashboardNav actions={navActions} />

      <main className="command-main">
        <DashboardHeader
          family={data.family}
          dateLabel={data.today.label}
          weekday={data.today.weekday}
          clock={digitalClock}
          dayPart={familyCurrentDayPart}
          actions={quickActions}
        />

        {dashboardView === "profiles" ? (
          <motion.div
            key="profiles"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <ProfilesDirectory
              stats={memberStats}
              selectedUser={selectedUser}
              completions={data.completions}
              dateKey={todayDateKey}
              pendingTaskKeys={pendingTaskKeys}
              onSelect={setActiveProfile}
              onComplete={(task) =>
                void completeTask(task.id, selectedUser.id, todayDateKey, task.title, task.points)
              }
              onUndo={(task) =>
                void undoTaskCompletion(task.id, selectedUser.id, todayDateKey, task.title)
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="command-home-grid"
          >
            <TodayOverview
              stats={memberStats}
              selectedUser={selectedUser}
              onSelect={(userId) => {
                setActiveProfile(userId);
                setDashboardView("profiles");
              }}
            />
          </motion.div>
        )}
      </main>

      <nav className="command-bottom-nav">
        {[...navActions, quickActions[0]].map((action) => {
          const Icon = action.icon;

          return (
            <button
              key={action.label}
              type="button"
              className={action.active ? "is-active" : ""}
              onClick={action.onClick}
            >
              <Icon className="h-5 w-5" />
              <span>{action.label}</span>
            </button>
          );
        })}
      </nav>

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
        onDeleteUser={deleteUser}
        onSaveTask={saveTask}
        onReorderTasks={reorderTasks}
        onAdjustPoints={adjustPoints}
        onUndoTaskCompletion={undoTaskCompletion}
        onResetProgress={resetProgress}
        onUpdateSettings={updateFamilySettings}
        onChangeAccountPassword={changeAccountPassword}
        onChangeParentPin={changeParentPin}
        onLogout={logoutParent}
      />

      <AnimatePresence>
        {toast?.kind === "hata" ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="command-toast is-error"
          >
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
