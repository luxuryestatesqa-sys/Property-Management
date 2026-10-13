import { createHash } from "crypto";

// A profile photo is stored as a data URL. Putting it in every row of a list (100 leads, 20 listings)
// repeats the same few kilobytes over and over, so lists send a short link to the cacheable avatar route
// instead. The "v" part changes when the photo does, so browsers keep it for a year.
export function avatarLink<T extends { id: string; avatarUrl: string | null }>(user: T | null): T | null {
  if (!user || !user.avatarUrl || !user.avatarUrl.startsWith("data:")) return user;
  const v = createHash("md5").update(user.avatarUrl).digest("hex").slice(0, 10);
  return { ...user, avatarUrl: `/api/users/${user.id}/avatar?v=${v}` };
}
