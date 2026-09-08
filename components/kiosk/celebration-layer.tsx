"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, PartyPopper, Sparkles, Star, Wallet } from "lucide-react";
import { AvatarDisplay } from "@/components/kiosk/avatar-display";
import { formatAllowance } from "@/lib/allowance";

interface CelebrationLayerProps {
  open: boolean;
  userName: string;
  userAvatar: string;
  taskTitle: string;
  points: number;
  totalPoints: number;
  onDone: () => void;
}

const particles = Array.from({ length: 24 }, (_, index) => ({
  id: index,
  left: 50 + ((index % 7) - 3) * 18,
  top: 10 + (index % 4) * 12,
  rotate: -120 + index * 16,
  x: (index % 2 === 0 ? -1 : 1) * (30 + index * 6),
  y: -120 - (index % 5) * 20
}));

function hashSeed(value: string) {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function pickBySeed<T>(items: T[], seed: number, offset = 0) {
  return items[(seed + offset) % items.length];
}

function getCelebrationCopy(userName: string, taskTitle: string, points: number, totalPoints: number) {
  const seed = hashSeed(`${userName}-${taskTitle}-${points}-${totalPoints}`);
  const earned = formatAllowance(points);
  const total = formatAllowance(totalPoints);

  const kicker = pickBySeed(
    ["Görev tamam", "Harçlık kazandın", "Harika gidiyorsun", "Bugün güzel akıyor"],
    seed
  );

  const headline = pickBySeed(
    [
      `${userName}, bunu da hallettin`,
      `${userName}, sahane gidiyorsun`,
      `${userName}, yine cok iyiydin`,
      `${userName}, eline saglik`
    ],
    seed,
    1
  );

  const body = pickBySeed(
    [
      `"${taskTitle}" bitti. Bu turda ${earned} harçlık kazandın.`,
      `"${taskTitle}" tamam. ${earned} daha senin oldu.`,
      `"${taskTitle}" isaretlendi. Harcligin guzelce birikiyor.`,
      `"${taskTitle}" guzelce halloldu. ${earned} eklendi.`
    ],
    seed,
    2
  );

  const footer = pickBySeed(
    [
      `Toplam harcligin simdi ${total}.`,
      `Su an toplam ${total} harcligin var.`,
      `${total} harcliga ulastin.`,
      `Harçlık hanende şimdi ${total} var.`
    ],
    seed,
    3
  );

  return { kicker, headline, body, footer };
}

export function CelebrationLayer({
  open,
  userName,
  userAvatar,
  taskTitle,
  points,
  totalPoints,
  onDone
}: CelebrationLayerProps) {
  const copy = getCelebrationCopy(userName, taskTitle, points, totalPoints);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeout = window.setTimeout(onDone, 2200);
    return () => window.clearTimeout(timeout);
  }, [open, onDone]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key={`${userName}-${taskTitle}-${points}-${totalPoints}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] overflow-hidden"
        >
          <div className="absolute inset-0 bg-slate-950/42 backdrop-blur-[8px]" />
          <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--active-soft-strong)] blur-[120px]" />

          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              initial={{ opacity: 0, scale: 0.4, x: 0, y: 0, rotate: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                scale: [0.4, 1, 1, 0.8],
                x: particle.x,
                y: particle.y,
                rotate: particle.rotate
              }}
              transition={{ duration: 1.15, ease: "easeOut", delay: particle.id * 0.018 }}
              className="absolute left-1/2 top-1/2"
              style={{ marginLeft: `${particle.left}px`, marginTop: `${particle.top}px` }}
            >
              {particle.id % 3 === 0 ? (
                <Star className="h-8 w-8 fill-amber-300 text-amber-300" />
              ) : particle.id % 2 === 0 ? (
                <Sparkles className="h-8 w-8 text-emerald-200" />
              ) : (
                <PartyPopper className="h-8 w-8 text-emerald-200" />
              )}
            </motion.div>
          ))}

          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.84, y: 26 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.84 }}
              transition={{ duration: 0.34, ease: "easeOut" }}
              className="relative w-[min(92vw,34rem)] overflow-hidden rounded-[2.3rem] border border-white/12 bg-[#121a17] text-white shadow-[0_32px_90px_rgba(0,0,0,0.42)]"
            >
              <div className="pointer-events-none absolute -right-8 top-0 h-32 w-32 rounded-full bg-emerald-300/16 blur-3xl" />
              <div className="pointer-events-none absolute bottom-[-3rem] left-[-2rem] h-36 w-36 rounded-full bg-amber-200/16 blur-3xl" />

              <div className="relative px-8 py-9 text-center">
                <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-[2rem] border border-white/16 bg-white/8 text-[2.9rem] shadow-[0_18px_34px_rgba(0,0,0,0.24)]">
                  <AvatarDisplay avatar={userAvatar} name={userName} />
                </div>

                <div className="mt-5 text-sm font-semibold uppercase tracking-[0.22em] text-emerald-200">
                  {copy.kicker}
                </div>
                <div className="mt-2 text-[2.25rem] font-semibold tracking-[-0.04em] leading-[0.95] sm:text-[2.65rem]">
                  {copy.headline}
                </div>
                <div className="mx-auto mt-3 max-w-[26rem] text-base leading-relaxed text-white/78 sm:text-[1.05rem]">
                  {copy.body}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/8 px-4 py-2 text-sm font-semibold text-white/90 ring-1 ring-white/10">
                    <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                    {taskTitle}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-300/14 px-4 py-2 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-200/18">
                    <Wallet className="h-4 w-4" />+{formatAllowance(points)}
                  </div>
                </div>

                <div className="mt-6 rounded-[1.5rem] bg-white/7 px-5 py-4 ring-1 ring-white/10">
                  <div className="flex items-center justify-center gap-2 text-emerald-200">
                    <Wallet className="h-5 w-5" />
                    <Sparkles className="h-5 w-5" />
                    <PartyPopper className="h-5 w-5" />
                  </div>
                  <div className="mt-3 text-base font-semibold text-white/88">{copy.footer}</div>
                  <div className="mt-2 text-5xl font-semibold tracking-[-0.06em] text-white">
                    {formatAllowance(totalPoints)}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
