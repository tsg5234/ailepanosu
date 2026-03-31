"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { HeartHandshake, KeyRound, Plus, Sparkles, Trash2, Users } from "lucide-react";
import type { SetupPayload, UserRole } from "@/lib/types";

interface SetupScreenProps {
  working: boolean;
  username?: string | null;
  errorMessage?: string | null;
  onSubmit: (payload: SetupPayload) => Promise<void>;
  onLogout?: () => Promise<void>;
}

type SetupProfileDraft = SetupPayload["profiles"][number];

const PROFILE_COLORS = ["#2DD4BF", "#FB7185", "#60A5FA", "#F59E0B", "#22C55E", "#A855F7"];

function createProfile(role: UserRole): SetupProfileDraft {
  return {
    name: "",
    role,
    avatar: role === "ebeveyn" ? "👨" : "🦁",
    color: role === "ebeveyn" ? "#2DD4BF" : "#60A5FA",
    birthdate: null
  };
}

export function SetupScreen({
  working,
  username,
  errorMessage,
  onSubmit,
  onLogout
}: SetupScreenProps) {
  const [familyName, setFamilyName] = useState("");
  const [pin, setPin] = useState("");
  const [includeSampleData, setIncludeSampleData] = useState(false);
  const [profiles, setProfiles] = useState<SetupProfileDraft[]>([createProfile("ebeveyn")]);

  return (
    <div className="app-surface flex min-h-screen items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel-strong grid w-full max-w-7xl gap-8 overflow-hidden rounded-[2.8rem] p-6 lg:grid-cols-[1.02fr_0.98fr] lg:p-10"
      >
        <div
          className="relative overflow-hidden rounded-[2.4rem] p-8 text-white"
          style={{ backgroundImage: "linear-gradient(145deg, #0f172a, #14532d 44%, #0ea5e9 100%)" }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(251,191,36,0.28),transparent_26%),radial-gradient(circle_at_20%_80%,rgba(255,255,255,0.14),transparent_28%)]" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white/90">
                <Sparkles className="h-4 w-4" />
                Giristen sonra size ozel kurulum
              </span>
              <div className="space-y-3">
                <h1 className="max-w-xl text-4xl font-black leading-tight tracking-[-0.04em] lg:text-6xl">
                  Once hesabini ac, sonra kendi profillerini kendin kur.
                </h1>
                <p className="max-w-lg text-lg text-white/76">
                  Bu ekranda aile adini, ebeveyn PIN&apos;ini ve istedigin kadar profilini
                  olusturursun. Kurulum bitmeden hazir demo profiller acilmaz.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: Users, title: "Sinirsiz profil", text: "Ebeveyn ya da cocuk fark etmez" },
                { icon: HeartHandshake, title: "Size ozel baslangic", text: "Hazir aile yerine kendi kurulumun" },
                { icon: KeyRound, title: "PIN kilidi", text: "Yonetim paneli ebeveyn kontrolunde" }
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[1.9rem] border border-white/10 bg-white/12 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                >
                  <item.icon className="mb-4 h-6 w-6 text-amber-300" />
                  <h2 className="text-lg font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm text-white/72">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <form
          className="space-y-5 rounded-[2.2rem] bg-white/82 p-6 text-slate-900 shadow-panel"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit({
              familyName,
              pin,
              profiles,
              includeSampleData
            });
          }}
        >
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">
              Aile kurulumu
            </p>
            <h2 className="text-3xl font-black tracking-[-0.03em]">
              Profilleri burada olusturun
            </h2>
            <p className="text-sm text-slate-600">
              En az bir ebeveyn profili ekleyin. Sonrasinda parent panelden daha fazla profil
              ekleyebilirsin.
            </p>
            {username ? (
              <div className="inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                Hesap: {username}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Aile adi</span>
              <input
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                className="w-full rounded-[1.6rem] border border-slate-200 bg-white px-4 py-4 text-lg outline-none transition focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
                placeholder="Ornek: Guler Ailesi"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Ebeveyn PIN</span>
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                className="w-full rounded-[1.6rem] border border-slate-200 bg-white px-4 py-4 text-lg tracking-[0.4em] outline-none transition focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
                placeholder="1234"
              />
            </label>
          </div>

          <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-slate-50/85 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black text-slate-900">Baslangic profilleri</div>
                <div className="text-sm text-slate-600">
                  Istedigin kadar profil ekleyebilirsin.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setProfiles((current) => [...current, createProfile("ebeveyn")])}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white"
                >
                  <Plus className="h-4 w-4" />
                  Ebeveyn ekle
                </button>
                <button
                  type="button"
                  onClick={() => setProfiles((current) => [...current, createProfile("çocuk")])}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-4 py-2 text-sm font-bold text-sky-700"
                >
                  <Plus className="h-4 w-4" />
                  Cocuk ekle
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {profiles.map((profile, index) => (
                <div
                  key={`${index}-${profile.role}`}
                  className="rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                      Profil {index + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setProfiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                      disabled={profiles.length === 1}
                      className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Kaldir
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Isim</span>
                      <input
                        value={profile.name}
                        onChange={(event) =>
                          setProfiles((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, name: event.target.value } : item
                            )
                          )
                        }
                        className="w-full rounded-[1.3rem] border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                        placeholder={profile.role === "ebeveyn" ? "Anne, Baba..." : "Poyraz, Aden..."}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Rol</span>
                      <select
                        value={profile.role}
                        onChange={(event) =>
                          setProfiles((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    role: event.target.value as UserRole,
                                    avatar:
                                      event.target.value === "ebeveyn"
                                        ? item.avatar || "👨"
                                        : item.avatar || "🦁",
                                    birthdate:
                                      event.target.value === "ebeveyn" ? null : item.birthdate
                                  }
                                : item
                            )
                          )
                        }
                        className="w-full rounded-[1.3rem] border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                      >
                        <option value="ebeveyn">Ebeveyn</option>
                        <option value="çocuk">Cocuk</option>
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Avatar</span>
                      <input
                        value={profile.avatar}
                        onChange={(event) =>
                          setProfiles((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, avatar: event.target.value } : item
                            )
                          )
                        }
                        className="w-full rounded-[1.3rem] border border-slate-200 bg-white px-4 py-3 text-2xl outline-none transition focus:border-emerald-400 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                        placeholder="🙂"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Renk</span>
                      <div className="rounded-[1.3rem] border border-slate-200 bg-white px-4 py-3">
                        <div className="mb-3 flex items-center gap-3">
                          <input
                            type="color"
                            value={profile.color}
                            onChange={(event) =>
                              setProfiles((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, color: event.target.value } : item
                                )
                              )
                            }
                            className="h-10 w-14 rounded-xl"
                          />
                          <span className="text-sm font-semibold text-slate-600">{profile.color}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {PROFILE_COLORS.map((color) => (
                            <button
                              key={`${index}-${color}`}
                              type="button"
                              onClick={() =>
                                setProfiles((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, color } : item
                                  )
                                )
                              }
                              className={`h-7 w-7 rounded-full border-2 ${
                                profile.color === color ? "border-slate-950" : "border-white"
                              }`}
                              style={{ backgroundColor: color }}
                              aria-label={`Renk ${color}`}
                            />
                          ))}
                        </div>
                      </div>
                    </label>

                    <label className="block space-y-2 md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">
                        Dogum tarihi {profile.role === "çocuk" ? "(opsiyonel)" : "(gerekmez)"}
                      </span>
                      <input
                        type="date"
                        value={profile.birthdate ?? ""}
                        disabled={profile.role !== "çocuk"}
                        onChange={(event) =>
                          setProfiles((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, birthdate: event.target.value || null }
                                : item
                            )
                          )
                        }
                        className="w-full rounded-[1.3rem] border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)] disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-[1.9rem] border border-slate-200 bg-slate-50 px-4 py-4">
            <div>
              <div className="font-semibold text-slate-900">Ornek gorev ve oduller ekle</div>
              <div className="text-sm text-slate-600">
                Profil eklemez; sadece baslangic gorevleri ve odulleri olusturur.
              </div>
            </div>
            <input
              type="checkbox"
              checked={includeSampleData}
              onChange={(event) => setIncludeSampleData(event.target.checked)}
              className="h-6 w-6 rounded border-slate-300 text-teal-500"
            />
          </label>

          {errorMessage ? (
            <div className="rounded-[1.5rem] bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={working}
            className="w-full rounded-[1.9rem] bg-[linear-gradient(135deg,#22c55e,#38bdf8)] px-6 py-5 text-lg font-black text-white shadow-[0_18px_34px_rgba(34,197,94,0.24)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? "Kuruluyor..." : "Profilleri olustur ve baslat"}
          </button>

          {onLogout ? (
            <button
              type="button"
              onClick={() => void onLogout()}
              className="w-full rounded-[1.6rem] bg-slate-100 px-5 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-200"
            >
              Bu hesaptan cik
            </button>
          ) : null}
        </form>
      </motion.div>
    </div>
  );
}
