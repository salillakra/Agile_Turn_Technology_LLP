const monitorPort = process.env.QUEUE_MONITOR_PORT?.trim() || "3030";
const monitorOrigin = `http://127.0.0.1:${monitorPort}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal standalone server bundle for Docker (copies only needed node_modules).
  output: "standalone",
  experimental: {
    webpackMemoryOptimizations: true,
  },
  /**
   * Dev: Bull Board runs on QUEUE_MONITOR_PORT (default 3030); proxy so monitor links can use NEXTAUTH_URL.
   */
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return {
      beforeFiles: [
        {
          source: "/admin/queues",
          has: [{ type: "query", key: "accessToken" }],
          destination: `${monitorOrigin}/admin/queues`,
        },
        {
          source: "/admin/queues",
          has: [{ type: "cookie", key: "queue-monitor-session" }],
          destination: `${monitorOrigin}/admin/queues`,
        },
        {
          source: "/admin/queues/:path*",
          destination: `${monitorOrigin}/admin/queues/:path*`,
        },
      ],
    };
  },
  /** Keep heavy native/Node packages out of the webpack graph where possible. */
  serverExternalPackages: [
    "@prisma/client",
    "bcrypt",
    "pdf-parse",
    "pdfkit",
    "mammoth",
    "exceljs",
    "word-extractor",
    "bullmq",
    "ioredis",
    "@bull-board/api",
    "@bull-board/express",
    "express",
  ],
};

export default nextConfig;
