const monitorPort = process.env.QUEUE_MONITOR_PORT?.trim() || "3030";
const monitorOrigin = `http://127.0.0.1:${monitorPort}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /** Reduces peak webpack memory during `next dev` (Next.js 15+). */
    webpackMemoryOptimizations: true,
  },
  /**
   * Dev: Bull Board runs on QUEUE_MONITOR_PORT (default 3030); proxy so monitor links can use NEXTAUTH_URL.
   */
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/admin/queues", destination: `${monitorOrigin}/admin/queues` },
      { source: "/admin/queues/:path*", destination: `${monitorOrigin}/admin/queues/:path*` },
    ];
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
  ],
  webpack: (config, { dev }) => {
    if (dev) {
      // PackFileCacheStrategy can OOM on long Windows dev sessions; trade cache for stability.
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
