/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // pdfjs-dist and mammoth are Node-only libraries that pull in their own
    // worker/asset files; bundling them breaks the form-import route, so let
    // Node resolve them at runtime instead.
    serverComponentsExternalPackages: ["pdfjs-dist", "mammoth"],
  },
};

module.exports = nextConfig;
