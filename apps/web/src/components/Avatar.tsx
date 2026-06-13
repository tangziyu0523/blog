import { avatarSrc } from "@/lib/avatar";

export function Avatar({
  nickname,
  avatarUrl,
  size = 32,
}: {
  nickname: string;
  avatarUrl: string | null;
  size?: number;
}) {
  const dim = { width: size, height: size };
  if (avatarUrl) {
    return (
      <img
        src={avatarSrc(avatarUrl)}
        alt={nickname}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ ...dim, border: "1px solid var(--border)" }}
      />
    );
  }
  const initial = nickname.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="inline-flex items-center justify-center rounded-full select-none"
      style={{
        ...dim,
        background: "var(--surface-2)",
        color: "var(--text-2)",
        fontSize: size * 0.45,
        border: "1px solid var(--border)",
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
