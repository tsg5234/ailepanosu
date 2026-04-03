"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Users } from "lucide-react";
import { AvatarPicker } from "@/components/kiosk/avatar-picker";
import {
  getDefaultAvatar,
  normalizeAvatarForRole
} from "@/lib/avatar";
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
const PARENT_ROLE: UserRole = "ebeveyn";
const CHILD_ROLE: UserRole = "çocuk";
function createProfile(role: UserRole): SetupProfileDraft {
  return {
    name: "",
    role,
    avatar: getDefaultAvatar(role),
    color: role === PARENT_ROLE ? "#2DD4BF" : "#60A5FA",
    birthdate: null,
    visible_in_kiosk: true
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
  const [profiles, setProfiles] = useState<SetupProfileDraft[]>([]);
  const updateProfile = (
    index: number,
    updater: (profile: SetupProfileDraft) => SetupProfileDraft
  ) => {
    setProfiles((current) =>
      current.map((profile, profileIndex) =>
        profileIndex === index ? updater(profile) : profile
      )
    );
  };

  return (
    <div className="app-surface flex min-h-screen items-center justify-center px-4 py-6 sm:px-5 sm:py-8 lg:px-6">
      <motion.main
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="glass-panel-strong w-full max-w-[980px] overflow-hidden rounded-[2.6rem] p-3 sm:p-4"
      >
        <form
          className="space-y-5 rounded-[2.1rem] bg-white/92 p-5 text-slate-900 shadow-panel sm:p-6 lg:p-8"
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-emerald-700">
                Kurulum
              </p>
              <h1 className="text-3xl font-black tracking-[-0.05em] text-slate-950 sm:text-[2.4rem]">
                Aileni hazirla
              </h1>
              <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                Giriş hesabın yönetim için hazır. Aile adını yaz, PIN&apos;ini belirle ve görünecek ebeveyn ile çocuk profillerini ekle.
              </p>
            </div>

            {username ? (
              <div className="inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                Hesap: {username}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Aile adı</span>
              <input
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                className="w-full rounded-[1.6rem] border border-slate-200 bg-white px-4 py-4 text-lg outline-none transition focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
                placeholder="Örnek: Güler Ailesi"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Yönetim PIN</span>
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                className="w-full rounded-[1.6rem] border border-slate-200 bg-white px-4 py-4 text-lg tracking-[0.4em] outline-none transition focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
                placeholder="1234"
              />
            </label>
          </div>

          <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-slate-50/85 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <Users className="h-5 w-5 text-emerald-600" />
                  Başlangıç profilleri
                </div>
                <div className="text-sm text-slate-600">İstediğin kadar kişi ekleyebilirsin.</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setProfiles((current) => [...current, createProfile(PARENT_ROLE)])}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white"
                >
                  <Plus className="h-4 w-4" />
                  Ebeveyn ekle
                </button>
                <button
                  type="button"
                  onClick={() => setProfiles((current) => [...current, createProfile(CHILD_ROLE)])}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-4 py-2 text-sm font-bold text-sky-700"
                >
                  <Plus className="h-4 w-4" />
                  Çocuk ekle
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {profiles.length === 0 ? (
                <div className="rounded-[1.7rem] border border-dashed border-slate-300 bg-white/80 p-5 text-center text-slate-600">
                  Önce ailende görünecek bir profil ekle. İstersen ebeveyn, istersen çocuk profiliyle başlayabilirsin.
                </div>
              ) : null}
              {profiles.map((profile, index) => (
                <div
                  key={`${index}-${profile.role}`}
                  className="rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                        Profil {index + 1}
                      </div>
                      <div className="text-sm font-semibold text-slate-700">
                        {profile.role === PARENT_ROLE ? "Ebeveyn profili" : "Çocuk profili"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setProfiles((current) =>
                          current.filter((_, profileIndex) => profileIndex !== index)
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      Kaldır
                    </button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4">
                      <label className="block space-y-2">
                        <span className="text-sm font-semibold text-slate-700">İsim</span>
                        <input
                          value={profile.name}
                          onChange={(event) =>
                            updateProfile(index, (current) => ({
                              ...current,
                              name: event.target.value
                            }))
                          }
                          className="w-full rounded-[1.3rem] border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                          placeholder={profile.role === PARENT_ROLE ? "Anne, Baba..." : "Poyraz, Aden..."}
                        />
                      </label>

                      <div className="space-y-2">
                        <AvatarPicker
                          role={profile.role}
                          value={profile.avatar}
                          onChange={(avatar) =>
                            updateProfile(index, (current) => ({
                              ...current,
                              avatar
                            }))
                          }
                        />
                      </div>

                      {profile.role === CHILD_ROLE ? (
                        <label className="block space-y-2">
                          <span className="text-sm font-semibold text-slate-700">
                            Doğum tarihi (opsiyonel)
                          </span>
                          <input
                            type="date"
                            value={profile.birthdate ?? ""}
                            onChange={(event) =>
                              updateProfile(index, (current) => ({
                                ...current,
                                birthdate: event.target.value || null
                              }))
                            }
                            className="w-full rounded-[1.3rem] border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                          />
                        </label>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <label className="block space-y-2">
                        <span className="text-sm font-semibold text-slate-700">Rol</span>
                        <select
                          value={profile.role}
                          onChange={(event) => {
                            const role = event.target.value as UserRole;

                            updateProfile(index, (current) => ({
                              ...current,
                              role,
                              avatar: normalizeAvatarForRole(role, current.avatar),
                              birthdate: role === PARENT_ROLE ? null : current.birthdate
                            }));
                          }}
                          className="w-full rounded-[1.3rem] border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                        >
                          <option value={PARENT_ROLE}>Ebeveyn</option>
                          <option value={CHILD_ROLE}>Çocuk</option>
                        </select>
                      </label>

                      <label className="block space-y-2">
                        <span className="text-sm font-semibold text-slate-700">Renk</span>
                        <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="mb-3 flex items-center gap-3">
                            <input
                              type="color"
                              value={profile.color}
                              onChange={(event) =>
                                updateProfile(index, (current) => ({
                                  ...current,
                                  color: event.target.value
                                }))
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
                                  updateProfile(index, (current) => ({
                                    ...current,
                                    color
                                  }))
                                }
                                className={`h-8 w-8 rounded-full border-2 transition ${
                                  profile.color === color ? "border-slate-950 scale-105" : "border-white"
                                }`}
                                style={{ backgroundColor: color }}
                                aria-label={`Renk ${color}`}
                              />
                            ))}
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-4 rounded-[1.9rem] border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold text-slate-900">Örnek görev ve ödüller ekle</div>
              <div className="text-sm text-slate-600">
                Profil eklemez; sadece başlangıç görevleri ve ödülleri oluşturur.
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
      </motion.main>
    </div>
  );
}
