/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit loads .afm font metrics from disk; bundling breaks those paths → HTTP 500 on export.
  serverExternalPackages: ["pdfkit", "pdf-parse", "mammoth", "word-extractor"],
};

export default nextConfig;
