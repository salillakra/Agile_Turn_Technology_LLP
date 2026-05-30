import { redirect } from "next/navigation";

/**
 * Convenience redirect so `/admin/queues` opened on the Next.js origin
 * always becomes a tokenized link (instead of unauthenticated Bull Board UI).
 */
export default function AdminQueuesRedirectPage() {
  redirect("/api/admin/queue-monitor/access");
}

