/** @type {import('next').NextConfig} */
const nextConfig = {
  // sql.js's UMD wrapper (dist/sql-wasm.js) breaks when webpack bundles it
  // into the server/RSC chunk ("Cannot set properties of undefined (setting
  // 'exports')") — keep it as a plain Node require instead.
  experimental: {
    serverComponentsExternalPackages: ["sql.js"],
    // Being external to webpack means sql-wasm.wasm is loaded via a plain
    // fs read at runtime, not a statically analyzable import — Vercel's
    // build-output file tracer doesn't see that reference on its own and
    // leaves the .wasm out of the deployed function bundle ("ENOENT ...
    // sql-wasm.wasm" in production). This forces it to be included.
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/sql.js/dist/*.wasm"],
      "/": ["./node_modules/sql.js/dist/*.wasm"],
    },
  },
  // Funnel the old Vercel-assigned production alias to the real domain.
  // Scoped to that exact hostname (not a *.vercel.app wildcard) so preview
  // deployment URLs (progetto-psycochat-<hash>-<team>.vercel.app) still load
  // directly instead of bouncing to production.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "progetto-psycochat.vercel.app" }],
        destination: "https://aipersonality.org/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
