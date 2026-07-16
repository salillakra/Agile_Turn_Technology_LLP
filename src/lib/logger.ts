import pino from "pino";

const level =
  process.env.LOG_LEVEL?.trim().toLowerCase() ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

/** Structured logger for workers and background jobs. */
export const logger = pino({
  level,
  base: {
    service: "ats",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export function workerLogger(workerName: string) {
  return logger.child({ component: "worker", worker: workerName });
}
