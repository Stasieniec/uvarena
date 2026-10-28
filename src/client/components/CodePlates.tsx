// A join code as six plates in Barlow Condensed 48 (Broadcast "Duel a friend").
// Shared so the friend screens and the lobby show a code the same way.
export function CodePlates({ code, className }: { code: string; className?: string }) {
  const chars = code.split("");
  return (
    <div
      role="img"
      aria-label={`Code ${chars.join(" ")}`}
      className={className}
      style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, chars.length)}, minmax(0, 1fr))`, gap: 6 }}
    >
      {chars.map((ch, i) => (
        <span key={i} aria-hidden className="plate font-display flex h-[72px] items-center justify-center text-5xl leading-none font-bold">
          {ch}
        </span>
      ))}
    </div>
  );
}
