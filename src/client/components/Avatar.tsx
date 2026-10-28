// A player's picture, or their initials on a coloured circle until they add one.
// One rule app-wide, the match screen included: the first two letters of the
// username, on a colour from the user id.
import { useState } from "react";
import { hueFor, initials } from "../lib/format";
import { cx } from "./ui";

export interface AvatarUser {
  id: string;
  username?: string | null;
  displayUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
}

/**
 * `tone="you"` draws the initials disc in your colour with dark text, as on
 * Home and in the HUD; otherwise the disc takes a colour from the user id.
 */
export function Avatar({ user, size = 40, className, ring, tone }: { user: AvatarUser; size?: number; className?: string; ring?: string; tone?: "you" }) {
  const [broken, setBroken] = useState(false);
  const label = user.displayUsername ?? user.username ?? "Player";
  const style = { width: size, height: size, boxShadow: ring ? `0 0 0 2px var(--color-bg), 0 0 0 4px ${ring}` : undefined };
  if (user.image && !broken) {
    return (
      <img
        src={user.image}
        alt={label}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cx("shrink-0 rounded-full bg-surface-2 object-cover", className)}
        style={style}
      />
    );
  }
  const hue = hueFor(user.id);
  return (
    <span
      role="img"
      aria-label={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full select-none",
        tone === "you" ? "font-display font-bold text-bg" : "font-semibold text-white",
        className,
      )}
      style={{
        ...style,
        background: tone === "you" ? "var(--color-you)" : `hsl(${hue} 55% 40%)`,
        fontSize: Math.max(10, Math.round(size * (tone === "you" ? 0.53 : 0.38))),
      }}
    >
      {tone === "you" ? label.slice(0, 1).toUpperCase() : initials(null, null, user.displayUsername ?? user.username)}
    </span>
  );
}

/** Avatar for a bot opponent: a blue disc with the bot's first letter. */
export function BotAvatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white", className)}
      style={{
        width: size,
        height: size,
        background: "var(--color-line)",
        fontSize: Math.round(size * 0.42),
      }}
    >
      {name.slice(0, 1)}
    </span>
  );
}
