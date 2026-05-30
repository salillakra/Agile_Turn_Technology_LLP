/**
 * Runs once when the Node.js server starts (not in Edge).
 * Ensures local resume storage exists before any upload/read handlers run.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureResumeUploadDir } = await import("@/src/lib/resume-storage");
    const { ensureProfileMediaDir } = await import("@/src/lib/profile-media-storage");
    ensureResumeUploadDir();
    ensureProfileMediaDir();

    const autoStart =
      process.env.NODE_ENV === "development" &&
      process.env.QUEUE_MONITOR_AUTO_START !== "false";
    if (autoStart) {
      const { ensureQueueMonitorServerStarted } = await import(
        "@/src/lib/queues/queue-monitor-server"
      );
      void ensureQueueMonitorServerStarted().then((result) => {
        if (!result.ok) {
          console.warn("[monitor] auto-start failed:", result.error);
        }
      });
    }
  }
}
