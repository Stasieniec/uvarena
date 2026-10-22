// Users as the API shows them.
import { eq, inArray } from "drizzle-orm";
import type { MeUser, PublicUser } from "../../../shared/api-schemas";
import { user } from "../schema";
import type { Db } from "./db";

export type UserRow = typeof user.$inferSelect;

/** Columns PublicUser needs. */
export const publicUserColumns = {
  id: user.id,
  username: user.username,
  displayUsername: user.displayUsername,
  firstName: user.firstName,
  lastName: user.lastName,
  image: user.image,
} as const;

type PublicUserRow = Pick<UserRow, "id" | "username" | "displayUsername" | "firstName" | "lastName" | "image">;

export function toPublicUser(row: PublicUserRow): PublicUser {
  const username = row.username ?? "";
  return {
    id: row.id,
    username,
    displayUsername: row.displayUsername ?? username,
    firstName: row.firstName,
    lastName: row.lastName,
    image: row.image ?? null,
  };
}

export function toMeUser(row: UserRow): MeUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    name: row.name,
    username: row.username ?? null,
    displayUsername: row.displayUsername ?? row.username ?? null,
    firstName: row.firstName,
    lastName: row.lastName,
    image: row.image ?? null,
    role: row.role === "admin" ? "admin" : "user",
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
  };
}

export async function getUserById(db: Db, id: string): Promise<UserRow | null> {
  const rows = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Usernames are stored lowercased by the username plugin. */
export async function getUserByUsername(db: Db, username: string): Promise<UserRow | null> {
  const rows = await db.select().from(user).where(eq(user.username, username.trim().toLowerCase())).limit(1);
  return rows[0] ?? null;
}

/** Public users by id; ids that no longer exist are missing from the map. */
export async function publicUsersById(db: Db, ids: Iterable<string | null | undefined>): Promise<Map<string, PublicUser>> {
  const unique = [...new Set([...ids].filter((id): id is string => typeof id === "string" && id.length > 0))];
  const map = new Map<string, PublicUser>();
  // D1 caps bound parameters per statement; chunk to stay well under it.
  for (let i = 0; i < unique.length; i += 50) {
    const rows = await db.select(publicUserColumns).from(user).where(inArray(user.id, unique.slice(i, i + 50)));
    for (const row of rows) map.set(row.id, toPublicUser(row));
  }
  return map;
}
