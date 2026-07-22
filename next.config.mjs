/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal standalone server bundle for Docker (copies only needed node_modules).
  output: "standalone",
  experimental: {
    webpackMemoryOptimizations: true,
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
    "@getbrevo/brevo",
  ],
};

export default nextConfig;
