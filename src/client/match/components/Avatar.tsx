import { useState } from "react";
import { hueFor, initials } from "../../lib/format";

interface AvatarProps {
  name: string;
  url: string | null;
  size: number;
  ring: string;
  bot?: boolean;
  /** Seeds the colour, so a player has the same circle here as everywhere else in the app. */
  userId?: string | null;
}

/**
 * The player's picture, or initials on a coloured circle until they add one.
 * Same rule as the app's Avatar: the first two letters of the username on a
 * colour from the user id; bots are a blue disc with their first letter.
 */
export function Avatar({ name, url, size, ring, bot, userId }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const style = {
    width: size,
    height: size,
    boxShadow: `0 0 0 2px ${ring}`,
  };
  if (url && !broken) {
    return <img src={url} alt="" onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover" style={style} />;
  }
  if (bot) {
    return (
      <div
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white"
        style={{ ...style, background: "var(--color-border)", fontSize: Math.round(size * 0.42) }}
      >
        {name.slice(0, 1)}
      </div>
    );
  }
  const hue = hueFor(userId ?? name);
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        ...style,
        background: `hsl(${hue} 55% 40%)`,
        fontSize: Math.max(10, Math.round(size * 0.38)),
      }}
    >
      {initials(null, null, name)}
    </div>
  );
}
