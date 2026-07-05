import apiClient from "@/lib/axios";

export interface ActivityLogUser {
  id?: string;
  name: string | null;
  email: string | null;
}

export interface ActivityLogItem {
  id: string;
  action: string;
  details?: unknown;
  applicationId?: string | null;
  createdAt: string;
  user?: ActivityLogUser | null;
}

export interface ActivityLogFeed {
  activity: ActivityLogItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function fetchActivityLogs(
  limit = 25,
  cursor?: string | null
): Promise<ActivityLogFeed> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const { data } = await apiClient.get<ActivityLogFeed>(`/dashboard/activity?${params}`);
  return data;
}
