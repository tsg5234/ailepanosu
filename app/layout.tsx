import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Ev Programi",
  description: "Türkçe aile görev yönetim uygulaması",
  applicationName: "Ev Programi",
  appleWebApp: {
    capable: true,
    title: "Ev Programi",
    statusBarStyle: "black-translucent"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
