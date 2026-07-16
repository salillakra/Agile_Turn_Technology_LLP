import { invalidateCacheByTag } from "@/src/lib/cache/cache-utils";
import { notificationsUserTagKey } from "@/src/lib/cache/cache-keys";
import { isRedisConfigured } from "@/src/lib/redis-config";
import { getSharedRedisClient } from "@/src/lib/redis-connection";

/** Redis pub/sub channel for a user's in-app notification feed. */
export function notificationUserChannel(userId: string): string {
  return `notifications:user:${userId}`;
}

export type NotificationRealtimePayload = {
  type: "updated";
};

/** Invalidate cached notification pages/count and notify SSE subscribers. */
export async function notifyNotificationFeedUpdated(userId: string): Promise<void> {
  await invalidateCacheByTag(notificationsUserTagKey(userId), 1_000);
  await publishNotificationUpdated(userId);
}

/** Fire-and-forget wrapper for API handlers. */
export function scheduleNotificationFeedUpdated(userId: string): void {
  void notifyNotificationFeedUpdated(userId).catch((err) => {
    console.warn("[notifications-realtime] feed update failed:", err);
  });
}

/** Publish a lightweight "feed changed" event to connected SSE clients. */
export async function publishNotificationUpdated(userId: string): Promise<void> {
  if (!isRedisConfigured()) return;

  const client = getSharedRedisClient("default");
  if (!client) return;

  const payload: NotificationRealtimePayload = { type: "updated" };
  try {
    await client.publish(notificationUserChannel(userId), JSON.stringify(payload));
  } catch (err) {
    console.warn("[notifications-realtime] publish failed:", err);
  }
}
