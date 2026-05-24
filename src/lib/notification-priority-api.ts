import type { NotificationPriority } from "@prisma/client";

/** JSON shape for clients (`NotificationPriority` in Prisma is `LOW` | `MEDIUM` | `HIGH`). */
export type NotificationPriorityApi = "low" | "medium" | "high";

export function notificationPriorityToApi(
  p: NotificationPriority | null
): NotificationPriorityApi | null {
  if (p == null) return null;
  return p.toLowerCase() as NotificationPriorityApi;
}
