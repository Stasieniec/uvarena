// A player's picture, or their first letter on a disc until they add one: a
// line-coloured disc with text-colour letter, or your teal with a dark letter.
// The only round shapes in the app.
import { useState } from "react";
import { cx } from "./ui";

export interface AvatarUser {
  username?: string | null;
  displayUsername?: string | null;
  image?: string | null;
}

export function Avatar({ user, size = 40, you = false, className }: { user: AvatarUser; size?: number; you?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const name = user.displayUsername ?? user.username ?? "?";
  if (user.image && !broken) {
    return (
      <img
        src={user.image}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cx("shrink-0 rounded-full bg-line object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold select-none", you ? "bg-you text-bg" : "bg-line text-text", className)}
      style={{ width: size, height: size, fontSize: Math.round(size / 2) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
