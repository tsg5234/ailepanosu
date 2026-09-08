"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, LockKeyhole } from "lucide-react";

interface AccountScreenProps {
  working: boolean;
  errorMessage?: string | null;
  onLogin: (payload: { username: string; password: string }) => Promise<boolean | void>;
  onRegister: (payload: { username: string; password: string }) => Promise<boolean | void>;
}

type Mode = "login" | "register";

export function AccountScreen({
  working,
  errorMessage,
  onLogin,
  onRegister
}: AccountScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submitLabel = useMemo(() => {
    if (working) {
      return mode === "login" ? "Giriş yapılıyor..." : "Hesap oluşturuluyor...";
    }

    return mode === "login" ? "Hesaba gir" : "Hesap oluştur";
  }, [mode, working]);

  const visibleError = localError || errorMessage;

  return (
    <div className="app-surface auth-premium-surface flex min-h-screen items-center justify-center px-4 py-6 sm:px-5 sm:py-8 lg:px-6">
      <motion.main
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="auth-premium-shell grid w-full max-w-[1180px] gap-4 overflow-hidden p-3 sm:gap-5 sm:p-4 md:grid-cols-[0.92fr_1.08fr] md:items-stretch lg:gap-5 lg:p-5"
      >
        <section className="auth-premium-hero order-2 relative overflow-hidden p-6 text-white sm:p-7 md:order-1 md:min-h-[560px] lg:p-8 xl:min-h-[610px]">
          <div className="auth-logo-stage relative flex h-full flex-col items-center justify-center gap-7 text-center">
            <div className="auth-logo-frame">
              <Image
                src="/aile-panosu-logo.png"
                alt="Aile Panosu logosu"
                width={360}
                height={360}
                priority
              />
            </div>
            <div className="auth-logo-copy">
              <p>Aile komuta merkezi</p>
              <h1>Aile Panosu</h1>
              <span>Evdeki düzen için sade, güvenli ve ortak ekran.</span>
            </div>
          </div>
        </section>

        <section className="auth-premium-form order-1 p-5 shadow-panel sm:p-6 md:order-2 lg:p-7 xl:p-8">
          <div className="mb-7 flex items-center gap-3">
            <div className="auth-login-mark flex h-11 w-11 items-center justify-center text-white">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Güvenli giriş
              </div>
              <div className="text-lg font-semibold text-slate-950">Aile hesabı</div>
            </div>
          </div>

          <div className="auth-mode-switch flex items-center gap-2 border p-1">
            {[
              { id: "login" as const, label: "Giriş yap" },
              { id: "register" as const, label: "Hesap aç" }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMode(item.id);
                  setLocalError(null);
                }}
                className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
                  mode === item.id
                    ? "bg-slate-950 text-white shadow-[0_12px_28px_rgba(21,23,18,0.12)]"
                    : "text-slate-600"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <form
            className="mt-6 space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              setLocalError(null);

              if (username.trim().length < 3) {
                setLocalError("Kullanıcı adı en az 3 karakter olmalı.");
                return;
              }

              if (password.length < 6) {
                setLocalError("Şifre en az 6 karakter olmalı.");
                return;
              }

              if (mode === "register" && password !== confirmPassword) {
                setLocalError("Şifre tekrar alanı eşit değil.");
                return;
              }

              if (mode === "login") {
                const success = await onLogin({ username, password });
                if (success === false) {
                  setLocalError("Giriş yapılamadı. Kullanıcı adı veya şifreyi kontrol et.");
                }
                return;
              }

              const success = await onRegister({ username, password });
              if (success === false) {
                setLocalError("Hesap oluşturulamadı. Bilgileri kontrol et.");
              }
            }}
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                {mode === "login" ? "Hoş geldin" : "İlk adım"}
              </p>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.2rem]">
                {mode === "login" ? "Hesabına gir" : "Yeni hesap aç"}
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Kullanıcı adı alanında harf, rakam, nokta, tire ve alt çizgi kullan.
              </p>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-800">Kullanıcı adı</span>
              <input
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))
                }
                className="auth-premium-input w-full rounded-[1.15rem] border px-4 py-4 text-lg outline-none transition"
                placeholder="ornek-aile"
                autoComplete="username"
                minLength={3}
                required
              />
            </label>

            <div className={`grid gap-4 ${mode === "register" ? "md:grid-cols-2" : ""}`}>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-800">Şifre</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="auth-premium-input w-full rounded-[1.15rem] border px-4 py-4 text-lg outline-none transition"
                  placeholder="En az 6 karakter"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={6}
                  required
                />
              </label>

              {mode === "register" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-800">Şifre tekrar</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="auth-premium-input w-full rounded-[1.15rem] border px-4 py-4 text-lg outline-none transition"
                    placeholder="Şifreni tekrar yaz"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </label>
              ) : null}
            </div>

            {visibleError ? (
              <div className="border border-rose-300/40 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {visibleError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={working}
              className="auth-submit-button flex w-full items-center justify-center gap-2 px-6 py-5 text-lg font-semibold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitLabel}
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>
        </section>
      </motion.main>
    </div>
  );
}
