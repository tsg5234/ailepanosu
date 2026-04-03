"use client";

import { type ComponentType, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, MoonStar, Sparkles, Star, Sun, Sunrise, Sunset } from "lucide-react";
import { isTaskCompleted } from "@/lib/schedule";
import type {
  ActiveTimeBlock,
  CompletionRecord,
  FamilyRecord,
  TaskRecord,
  UserRecord
} from "@/lib/types";

type SummaryBlockId = "sabah" | "ogleden_sonra" | "aksam";

interface DaySummaryTheme {
  primary: string;
  secondary: string;
  accent: string;
  soft: string;
  softStrong: string;
  glow: string;
  text: string;
}

interface DaySummaryPanelProps {
  user: UserRecord;
  family: FamilyRecord | null;
  currentDayPart: ActiveTimeBlock;
  allTodayTasks: TaskRecord[];
  completions: CompletionRecord[];
  dateKey: string;
  dateLabel: string;
  weekday: string;
  theme: DaySummaryTheme;
}

interface SummaryBlockMeta {
  id: SummaryBlockId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface SummaryBlock {
  id: SummaryBlockId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  total: number;
  completed: number;
  remaining: number;
  status: string;
}

interface SummaryHeroContent {
  title: string;
  copy: string;
  icon: ComponentType<{ className?: string }>;
}

const BLOCK_META: SummaryBlockMeta[] = [
  { id: "sabah", label: "Sabah", icon: Sunrise },
  { id: "ogleden_sonra", label: "Öğleden Sonra", icon: Sun },
  { id: "aksam", label: "Akşam", icon: Sunset }
];

function getVisibleBlocks(currentDayPart: ActiveTimeBlock) {
  if (currentDayPart === "sabah") {
    return BLOCK_META.slice(0, 1);
  }

  if (currentDayPart === "ogleden_sonra") {
    return BLOCK_META.slice(0, 2);
  }

  if (currentDayPart === "gece") {
    return [];
  }

  return BLOCK_META;
}

function buildBlockSummary(args: {
  meta: SummaryBlockMeta;
  tasks: TaskRecord[];
  completions: CompletionRecord[];
  userId: string;
  dateKey: string;
  currentDayPart: ActiveTimeBlock;
}): SummaryBlock {
  const { meta, tasks, completions, userId, dateKey, currentDayPart } = args;
  const blockTasks = tasks.filter((task) => task.time_block === meta.id);
  const completed = blockTasks.filter((task) =>
    isTaskCompleted(completions, task.id, userId, dateKey)
  ).length;

  let status = "Sirada";

  if (blockTasks.length === 0) {
    status = "Plan yok";
  } else if (completed === blockTasks.length) {
    status = "Tamam";
  } else if (currentDayPart === "gece") {
    status = "Kapandi";
  } else if (
    (currentDayPart === "sabah" && meta.id === "sabah") ||
    (currentDayPart === "ogleden_sonra" && meta.id === "ogleden_sonra") ||
    (currentDayPart === "aksam" && meta.id === "aksam")
  ) {
    status = "Simdi";
  }

  return {
    id: meta.id,
    label: meta.label,
    icon: meta.icon,
    total: blockTasks.length,
    completed,
    remaining: Math.max(blockTasks.length - completed, 0),
    status
  };
}

function getDateBadgeLabel(dateLabel: string, weekday: string) {
  const normalizedDate =
    dateLabel.length > 1 ? `${dateLabel.slice(0, 1).toUpperCase()}${dateLabel.slice(1)}` : dateLabel;
  const weekdayKey = weekday.trim().toLocaleLowerCase("tr-TR");
  const weekdayLabel =
    {
      pzt: "Pazartesi",
      sal: "Salı",
      car: "Çarşamba",
      per: "Perşembe",
      cum: "Cuma",
      cts: "Cumartesi",
      paz: "Pazar"
    }[weekdayKey] ??
    (weekday.length > 1 ? `${weekday.slice(0, 1).toUpperCase()}${weekday.slice(1)}` : weekday);

  return `${normalizedDate}, ${weekdayLabel}`;
}

function getSummaryHero(args: {
  currentDayPart: ActiveTimeBlock;
  completionRate: number;
  hasTasks: boolean;
}): SummaryHeroContent {
  const { currentDayPart, completionRate, hasTasks } = args;

  if (!hasTasks) {
    if (currentDayPart === "gece") {
      return {
        title: "Bugün hafifti",
        copy: "Bugün sakin aktı. Yarının temposu için enerji birikti.",
        icon: Sparkles
      };
    }

    return {
      title: "Kısa bir nefes arası",
      copy: "Bu bölümde görev yok. Bir sonraki tur için enerji toplanıyor.",
      icon: Sparkles
    };
  }

  if (currentDayPart === "gece") {
    return completionRate === 100
      ? {
          title: "Bugün süper kapandı",
          copy: "Sabahı, öğleyi ve akşamı toparladın. Yarın da böyle akacak.",
          icon: MoonStar
        }
      : {
          title: "Bugünlük bu kadar",
          copy: "Kalanları yarın hallederiz. Şimdi dinlenme zamanı.",
          icon: MoonStar
        };
  }

  if (currentDayPart === "aksam") {
    return {
      title: "Akşam turu tamam",
      copy: "Günü güzel bir tempoyla kapattın. Gerisi keyif zamanı.",
      icon: Sunset
    };
  }

  if (currentDayPart === "ogleden_sonra") {
    return {
      title: "Tempo tam yerinde",
      copy: "Öğleden sonra görevlerin bitti. Gün çok iyi akıyor.",
      icon: Sun
    };
  }

  return {
    title: "Güne çok iyi girdin",
    copy: "Sabah görevlerin tamam. Bugünün ritmi şimdiden oturdu.",
    icon: Sunrise
  };
}

function getHeaderVisuals(currentDayPart: ActiveTimeBlock, celebrationMode: boolean) {
  if (currentDayPart === "gece") {
    return {
      titleGradient:
        "linear-gradient(135deg, #ffffff 0%, #dbeafe 28%, #fef3c7 68%, #ffffff 100%)",
      glowGradient: "radial-gradient(circle, rgba(191,219,254,0.42) 0%, rgba(191,219,254,0) 72%)",
      leftOrb: "rgba(251,191,36,0.34)",
      rightOrb: "rgba(191,219,254,0.34)",
      underlineGradient: "linear-gradient(90deg, rgba(251,191,36,0), rgba(251,191,36,0.95), rgba(191,219,254,0))",
      chipGradient:
        "linear-gradient(135deg, rgba(148,163,184,0.28) 0%, rgba(255,255,255,0.1) 100%)",
      chipShadow: "0 20px 36px rgba(15,23,42,0.2), inset 0 1px 0 rgba(255,255,255,0.14)",
      iconGradient: "linear-gradient(135deg, rgba(251,191,36,0.26), rgba(191,219,254,0.2))"
    };
  }

  if (currentDayPart === "aksam") {
    return {
      titleGradient:
        "linear-gradient(135deg, #fff7ed 0%, #ffffff 24%, #fcd34d 58%, #fca5a5 100%)",
      glowGradient: "radial-gradient(circle, rgba(252,211,77,0.42) 0%, rgba(252,211,77,0) 72%)",
      leftOrb: "rgba(251,191,36,0.36)",
      rightOrb: "rgba(251,146,60,0.34)",
      underlineGradient: "linear-gradient(90deg, rgba(251,191,36,0), rgba(251,191,36,0.95), rgba(251,146,60,0))",
      chipGradient:
        "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(254,215,170,0.12) 100%)",
      chipShadow: "0 20px 36px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
      iconGradient: "linear-gradient(135deg, rgba(252,211,77,0.28), rgba(251,146,60,0.22))"
    };
  }

  if (celebrationMode) {
    return {
      titleGradient:
        "linear-gradient(135deg, #ffffff 0%, #fde68a 40%, #ffffff 76%, #bbf7d0 100%)",
      glowGradient: "radial-gradient(circle, rgba(253,224,71,0.36) 0%, rgba(253,224,71,0) 72%)",
      leftOrb: "rgba(253,224,71,0.32)",
      rightOrb: "rgba(187,247,208,0.3)",
      underlineGradient: "linear-gradient(90deg, rgba(253,224,71,0), rgba(253,224,71,0.95), rgba(187,247,208,0))",
      chipGradient:
        "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(253,224,71,0.1) 100%)",
      chipShadow: "0 20px 36px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.16)",
      iconGradient: "linear-gradient(135deg, rgba(253,224,71,0.26), rgba(255,255,255,0.16))"
    };
  }

  return {
    titleGradient:
      "linear-gradient(135deg, #ffffff 0%, #fff7ed 38%, #fde68a 74%, #ffffff 100%)",
    glowGradient: "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 72%)",
    leftOrb: "rgba(255,255,255,0.24)",
    rightOrb: "rgba(253,224,71,0.28)",
    underlineGradient: "linear-gradient(90deg, rgba(255,255,255,0), rgba(253,224,71,0.9), rgba(255,255,255,0))",
    chipGradient:
      "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 100%)",
    chipShadow: "0 20px 36px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.14)",
    iconGradient: "linear-gradient(135deg, rgba(255,255,255,0.2), rgba(253,224,71,0.16))"
  };
}

export function DaySummaryPanel({
  user,
  currentDayPart,
  allTodayTasks,
  completions,
  dateKey,
  dateLabel,
  weekday,
  theme
}: DaySummaryPanelProps) {
  const [openBlockId, setOpenBlockId] = useState<SummaryBlockId | null>(null);
  const visibleBlocks = getVisibleBlocks(currentDayPart);
  const progressTasks =
    currentDayPart === "gece"
      ? allTodayTasks
      : allTodayTasks.filter((task) => task.time_block === currentDayPart);
  const completedTasks = progressTasks.filter((task) =>
    isTaskCompleted(completions, task.id, user.id, dateKey)
  );
  const completionRate = progressTasks.length
    ? Math.round((completedTasks.length / progressTasks.length) * 100)
    : currentDayPart === "gece"
      ? 0
      : 100;
  const blockSummaries = visibleBlocks.map((meta) =>
    buildBlockSummary({
      meta,
      tasks: allTodayTasks,
      completions,
      userId: user.id,
      dateKey,
      currentDayPart
    })
  );
  const ringLength = 339.292;
  const ringOffset = ringLength - (ringLength * completionRate) / 100;
  const celebrationMode = progressTasks.length > 0 && completionRate === 100;
  const dateBadgeLabel = getDateBadgeLabel(dateLabel, weekday);
  const hero = getSummaryHero({
    currentDayPart,
    completionRate,
    hasTasks: progressTasks.length > 0
  });
  const headerVisuals = getHeaderVisuals(currentDayPart, celebrationMode);
  const selectedBlockMeta = useMemo(
    () => BLOCK_META.find((block) => block.id === openBlockId) ?? null,
    [openBlockId]
  );
  const selectedBlockTasks = useMemo(() => {
    if (!openBlockId) {
      return [];
    }

    return allTodayTasks.filter(
      (task) =>
        (task.time_block === openBlockId || task.time_block === "her_zaman") &&
        !isTaskCompleted(completions, task.id, user.id, dateKey)
    );
  }, [allTodayTasks, completions, dateKey, openBlockId, user.id]);

  return (
    <section className="mt-5 space-y-4">
      <div
        className="relative overflow-hidden rounded-[2.9rem] p-6 text-white shadow-[0_28px_72px_var(--active-glow)] lg:p-8"
        style={{
          backgroundImage: `linear-gradient(145deg, ${theme.primary} 0%, ${theme.secondary} 68%, ${theme.accent} 148%)`,
          border: "1px solid rgba(255,255,255,0.16)"
        }}
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.22, 0.34, 0.22] }}
          transition={{ duration: celebrationMode ? 4.2 : 6, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute -right-16 top-[-2rem] h-52 w-52 rounded-full bg-white/18 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, -8, 0], opacity: [0.16, 0.28, 0.16] }}
          transition={{ duration: celebrationMode ? 3.2 : 5, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute bottom-[-4rem] left-[-2rem] h-48 w-48 rounded-full bg-amber-100/24 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, -2, 0], opacity: [0.84, 1, 0.84] }}
          transition={{ duration: celebrationMode ? 2.6 : 4.2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-6 top-6 z-10 inline-flex w-fit items-center gap-2 overflow-hidden rounded-full border border-white/20 px-3 py-2 text-white/90 backdrop-blur-md lg:left-8 lg:top-8"
          style={{ boxShadow: "0 16px 32px rgba(15,23,42,0.14)" }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)"
            }}
          />
          <div
            className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/16"
            style={{ backgroundImage: headerVisuals.iconGradient }}
          >
            <CalendarDays className="h-3.5 w-3.5 text-amber-100" />
          </div>
          <span className="relative text-sm font-semibold tracking-[-0.01em] sm:text-[0.95rem]">
            {dateBadgeLabel}
          </span>
        </motion.div>

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-center">
          <div className="min-w-0">
            <div className="flex min-h-[18rem] items-center justify-center px-2">
              <div className="w-full max-w-[31rem] text-center">
                <div className="relative mx-auto flex h-32 w-32 items-center justify-center">
                  <motion.div
                    animate={{ scale: celebrationMode ? [1, 1.05, 1] : [1, 1.02, 1], rotate: [0, 4, 0] }}
                    transition={{ duration: celebrationMode ? 3.2 : 5, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-[2.2rem] border border-white/18"
                    style={{
                      backgroundImage:
                        "linear-gradient(145deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.08) 100%)",
                      boxShadow: "0 24px 44px rgba(15,23,42,0.18)"
                    }}
                  />
                  <motion.div
                    animate={{ y: [0, -5, 0], opacity: [0.55, 0.92, 0.55] }}
                    transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
                    className="pointer-events-none absolute -left-3 bottom-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/18 backdrop-blur-sm"
                  >
                    <Sparkles className="h-4 w-4 text-amber-100" />
                  </motion.div>
                  <motion.div
                    animate={{ y: [0, 5, 0], opacity: [0.45, 0.84, 0.45] }}
                    transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                    className="pointer-events-none absolute -right-2 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/16 backdrop-blur-sm"
                  >
                    <Star className="h-3.5 w-3.5 text-white" />
                  </motion.div>
                  <div
                    className="absolute inset-[1.15rem] rounded-[1.7rem] border border-white/14"
                    style={{ backgroundImage: headerVisuals.iconGradient }}
                  />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-white/12 shadow-[0_18px_36px_rgba(15,23,42,0.16)]">
                    <hero.icon className="h-10 w-10 text-amber-100" />
                  </div>
                </div>

                <div className="mt-6">
                  <h2
                    className="text-[2rem] font-black tracking-[-0.06em] text-white sm:text-[2.5rem]"
                    style={{ filter: "drop-shadow(0 16px 28px rgba(15,23,42,0.22))" }}
                  >
                    <span
                      className="bg-clip-text text-transparent"
                      style={{ backgroundImage: headerVisuals.titleGradient }}
                    >
                      {hero.title}
                    </span>
                  </h2>
                  <p className="mx-auto mt-3 max-w-[26rem] text-[1rem] font-semibold leading-7 text-white/84 sm:text-[1.05rem]">
                    {hero.copy}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center xl:justify-end">
            <div className="relative flex h-[18rem] w-[18rem] items-center justify-center">
              <motion.div
                animate={{ rotate: [0, 6, 0], scale: celebrationMode ? [1, 1.06, 1] : [1, 1.02, 1] }}
                transition={{ duration: celebrationMode ? 3 : 5.5, repeat: Infinity, ease: "easeInOut" }}
                className="pointer-events-none absolute inset-0 rounded-full bg-white/8 blur-2xl"
              />

              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="8"
                />
                <motion.circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="url(#daySummaryRing)"
                  strokeLinecap="round"
                  strokeWidth="8"
                  initial={{ strokeDashoffset: ringLength }}
                  animate={{ strokeDashoffset: ringOffset }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  strokeDasharray={ringLength}
                />
                <defs>
                  <linearGradient id="daySummaryRing" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="45%" stopColor={theme.accent} />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
              </svg>

              <div className="relative z-10 flex flex-col items-center justify-center text-center">
                <motion.div
                  animate={celebrationMode ? { scale: [1, 1.14, 1], rotate: [0, -6, 6, 0] } : { y: [0, -4, 0] }}
                  transition={{ duration: celebrationMode ? 2.8 : 3.8, repeat: Infinity, ease: "easeInOut" }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/16 text-white shadow-[0_16px_34px_rgba(255,255,255,0.18)]"
                >
                  {celebrationMode ? (
                    currentDayPart === "gece" ? <MoonStar className="h-7 w-7" /> : <Sparkles className="h-7 w-7" />
                  ) : (
                    <Star className="h-7 w-7" />
                  )}
                </motion.div>
              <div className="mt-4 text-[3.3rem] font-black tracking-[-0.08em] text-white">
                %{completionRate}
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {blockSummaries.length ? (
        <div
          className={`grid gap-3 ${
            visibleBlocks.length === 1
              ? "grid-cols-1"
              : visibleBlocks.length === 2
                ? "grid-cols-1 md:grid-cols-2"
                : "grid-cols-1 md:grid-cols-3"
          }`}
        >
          {blockSummaries.map((block, index) => (
            <motion.button
              key={block.id}
              type="button"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.28, ease: "easeOut" }}
              onClick={() => setOpenBlockId(block.id)}
              className="glass-panel rounded-[2.1rem] p-5 text-left transition-transform hover:-translate-y-1"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] text-white shadow-[0_14px_26px_var(--active-glow)]"
                    style={{
                      backgroundImage: `linear-gradient(150deg, ${theme.primary} 0%, ${theme.secondary} 70%, ${theme.accent} 145%)`
                    }}
                  >
                    <block.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                      {block.status}
                    </div>
                    <div className="text-lg font-black tracking-[-0.03em] text-[color:var(--text-main)]">
                      {block.label}
                    </div>
                  </div>
                </div>
                <div className="rounded-full bg-[color:var(--active-soft)] px-3 py-2 text-sm font-black text-[color:var(--active-text)]">
                  {block.completed}/{block.total}
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200/90">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${block.total ? (block.completed / block.total) * 100 : 0}%` }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: 0.08 + index * 0.06 }}
                  className="h-full rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${theme.primary} 0%, ${theme.secondary} 100%)`
                  }}
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <div className="font-semibold text-[color:var(--text-muted)]">
                  {block.remaining > 0 ? `${block.remaining} eksik görev` : "Bu bölüm temiz"}
                </div>
                <div className="rounded-full bg-white/80 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-[color:var(--text-main)]">
                  Detaylari Gor
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-center">
        <div className="kid-score-pill">
          <Star className="h-5 w-5 text-[var(--active-primary)]" />
          Toplam {user.points} puan
        </div>
      </div>

      <AnimatePresence>
        {openBlockId && selectedBlockMeta ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[62] bg-slate-950/34 backdrop-blur-sm"
              onClick={() => setOpenBlockId(null)}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[63] flex items-center justify-center p-4 sm:p-6"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 12 }}
                className="w-[min(92vw,34rem)]"
              >
                <div className="glass-panel-strong rounded-[2.5rem] p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] text-white shadow-[0_14px_26px_var(--active-glow)]"
                        style={{
                          backgroundImage: `linear-gradient(150deg, ${theme.primary} 0%, ${theme.secondary} 70%, ${theme.accent} 145%)`
                        }}
                      >
                        <selectedBlockMeta.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                          Eksik Kalanlar
                        </div>
                        <div className="text-2xl font-black tracking-[-0.04em] text-[color:var(--text-main)]">
                          {selectedBlockMeta.label}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenBlockId(null)}
                      className="rounded-full bg-slate-200 px-4 py-2 text-sm font-black text-slate-700"
                    >
                      Kapat
                    </button>
                  </div>

                  {selectedBlockTasks.length ? (
                    <div className="mt-5 space-y-3">
                      {selectedBlockTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between gap-4 rounded-[1.4rem] border border-white/80 bg-white/80 px-4 py-4"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-[color:var(--text-main)]">
                              {task.title}
                            </div>
                            <div className="text-sm text-[color:var(--text-muted)]">
                              {task.time_block === "her_zaman" ? "Gün Boyu" : selectedBlockMeta.label}
                            </div>
                          </div>
                          <div className="kid-points-badge shrink-0">
                            <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
                            {task.points}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-[1.7rem] border border-emerald-100 bg-emerald-50 px-4 py-5 text-center text-sm font-semibold text-emerald-700">
                      Bu bölüm tertemiz. Eksik görev kalmadı.
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
