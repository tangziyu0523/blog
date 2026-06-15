import Link from "next/link";
import { Butterfly3 } from "@/components/illustrations";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
      <Butterfly3 width={120} height={120} className="opacity-80" />
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        迷路了
      </h1>
      <p style={{ color: "var(--text-2)" }}>
        这一页不在这本笔记里。
      </p>
      <Link href="/" className="underline" style={{ color: "var(--text-2)" }}>
        回到首页
      </Link>
    </main>
  );
}
