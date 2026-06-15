import type { Metadata } from "next";
import Link from "next/link";
import { Playfair_Display, Lora, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";
import { SmoothScroll } from "@/components/SmoothScroll";
import { FloatingNav } from "@/components/FloatingNav";
import { ScrollManager } from "@/components/ScrollManager";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600"], variable: "--font-display" });
const lora = Lora({ subsets: ["latin"], weight: ["400"], variable: "--font-body" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-ui" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Naturalist Journal",
  description: "工程级个人博客",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh"
      className={`${playfair.variable} ${lora.variable} ${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthProvider>
          <ScrollManager />
          <SmoothScroll>
            <header
              id="site-header"
              className="flex justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <Link href="/" style={{ fontFamily: "var(--font-display)" }}>
                Naturalist Journal
              </Link>
              <div className="flex items-center gap-4">
                <Link href="/search" style={{ color: "var(--text-2)" }}>
                  搜索
                </Link>
                <NotificationBell />
                <UserMenu />
              </div>
            </header>
            {children}
          </SmoothScroll>
          <FloatingNav />
        </AuthProvider>
      </body>
    </html>
  );
}
