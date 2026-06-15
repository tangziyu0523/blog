import type { Metadata } from "next";
import { Playfair_Display, Lora, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { SmoothScroll } from "@/components/SmoothScroll";
import { ScrollManager } from "@/components/ScrollManager";
import { SiteHeader } from "@/components/SiteHeader";
import { HomeModeProvider } from "@/components/HomeModeProvider";

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
          <HomeModeProvider>
            <SiteHeader />
            <ScrollManager />
            <SmoothScroll>{children}</SmoothScroll>
          </HomeModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
