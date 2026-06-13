const TINY = "font-sans text-[10px] uppercase tracking-[0.25em]";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const SEASONS = [
  "WINTER", "WINTER", "SPRING", "SPRING", "SPRING", "SUMMER",
  "SUMMER", "SUMMER", "AUTUMN", "AUTUMN", "AUTUMN", "WINTER",
];

/**
 * Unsymmetrical newspaper nameplate: oversized wordmark on the left, a tight
 * column of issue metadata on the right, bracketed by hairline + double rules.
 */
export function Masthead({ issue }: { issue: number }) {
  const now = new Date();
  const dateLabel = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const meta: Array<[string, string]> = [
    ["Issue", `Nº ${String(issue).padStart(2, "0")}`],
    ["Edition", `${SEASONS[now.getMonth()]} ${now.getFullYear()}`],
    ["Origin", "Blacksburg · VA"],
  ];

  return (
    <header className="pt-12 sm:pt-16">
      {/* top strip */}
      <div
        className="flex items-end justify-between border-b pb-2"
        style={{ borderColor: "var(--border)" }}
      >
        <span className={TINY} style={{ color: "var(--text-2)" }}>
          Naturalis Historia
        </span>
        <span className={TINY} style={{ color: "var(--text-2)" }}>
          {dateLabel}
        </span>
      </div>

      {/* nameplate row — big wordmark left, metadata column right */}
      <div className="mt-8 flex items-end justify-between gap-6">
        <h1
          className="tracking-tight"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(46px, 9vw, 92px)",
            lineHeight: 0.9,
          }}
        >
          Naturalist
          <br />
          Journal
        </h1>

        <dl className="hidden w-44 shrink-0 sm:block">
          {meta.map(([label, value], i) => (
            <div
              key={label}
              className="flex items-baseline justify-between py-1.5"
              style={i ? { borderTop: "1px solid var(--border)" } : undefined}
            >
              <dt className={TINY} style={{ color: "var(--text-3)" }}>
                {label}
              </dt>
              <dd className={TINY} style={{ color: "var(--text)" }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* double rule */}
      <div
        className="mt-7 h-[3px] border-y"
        style={{ borderColor: "var(--text)" }}
      />
    </header>
  );
}
