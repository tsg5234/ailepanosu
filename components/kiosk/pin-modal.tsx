"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface PinModalProps {
  open: boolean;
  working: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<void>;
}

export function PinModal({ open, working, onClose, onSubmit }: PinModalProps) {
  const [pin, setPin] = useState("");

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Sil", "0", "Tamam"];

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pin-modal-backdrop fixed inset-0 z-[60]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-4 sm:p-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              className="w-[min(92vw,480px)]"
            >
              <div className="pin-modal-panel p-6">
                <div className="text-center">
                  <div className="pin-modal-kicker text-sm font-bold uppercase tracking-[0.24em]">
                    Ebeveyn girişi
                  </div>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.03em]">PIN girin</h2>
                </div>

                <div className="pin-modal-display mt-5 px-4 py-5 text-center text-4xl tracking-[0.5em]">
                  {(pin || "*".repeat(4)).padEnd(4, "*").slice(0, 4)}
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  {digits.map((digit) => (
                    <button
                      key={digit}
                      onClick={async () => {
                        if (digit === "Sil") {
                          setPin((current) => current.slice(0, -1));
                          return;
                        }

                        if (digit === "Tamam") {
                          await onSubmit(pin);
                          setPin("");
                          return;
                        }

                        setPin((current) => `${current}${digit}`.slice(0, 6));
                      }}
                      disabled={working}
                      className={`pin-key px-4 py-5 text-xl font-black disabled:opacity-60 ${
                        digit === "Tamam" ? "is-submit" : digit === "Sil" ? "is-clear" : ""
                      }`}
                    >
                      {digit}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setPin("");
                    onClose();
                  }}
                  className="pin-cancel mt-4 w-full px-4 py-4 font-black"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
