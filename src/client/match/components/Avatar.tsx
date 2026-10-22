import { useState } from "react";
import { avatarHue, initials } from "../format";

interface AvatarProps {
  name: string;
  url: string | null;
  size: number;
  ring: string;
  bot?: boolean;
}

/** The player's picture, or initials on a coloured circle until they add one. */
export function Avatar({ name, url, size, ring, bot }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const hue = avatarHue(name);
  const style = {
    width: size,
    height: size,
    boxShadow: `0 0 0 2px ${ring}`,
    fontSize: Math.round(size * 0.38),
  };
  if (url && !broken) {
    return <img src={url} alt="" onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover" style={style} />;
  }
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        ...style,
        background: bot
          ? "linear-gradient(145deg, var(--color-bot), #1e3a8a)"
          : `linear-gradient(145deg, hsl(${hue} 60% 46%), hsl(${hue} 55% 30%))`,
      }}
    >
      {initials(name)}
    </div>
  );
}
