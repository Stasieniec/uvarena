// A player's picture, or their initials on a coloured circle until they add one.
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

export function Avatar({ user, size = 40, className, ring }: { user: AvatarUser; size?: number; className?: string; ring?: string }) {
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
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none", className)}
      style={{
        ...style,
        background: `linear-gradient(140deg, hsl(${hue} 65% 48%), hsl(${(hue + 40) % 360} 60% 32%))`,
        fontSize: Math.max(10, Math.round(size * 0.38)),
      }}
    >
      {initials(user.firstName, user.lastName, user.username)}
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
        background: "radial-gradient(circle at 30% 25%, #60a5fa, #1d4ed8 70%)",
        fontSize: Math.round(size * 0.42),
      }}
    >
      {name.slice(0, 1)}
    </span>
  );
}
