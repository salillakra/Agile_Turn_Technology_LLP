import type { NotificationReferenceType } from "@prisma/client";

/** JSON shape for clients (`NotificationReferenceType` in Prisma is `APPLICATION` | `CANDIDATE`). */
export type NotificationReferenceTypeApi = "application" | "candidate";

export function notificationReferenceTypeToApi(
  t: NotificationReferenceType | null
): NotificationReferenceTypeApi | null {
  if (t == null) return null;
  return t === "APPLICATION" ? "application" : "candidate";
}
