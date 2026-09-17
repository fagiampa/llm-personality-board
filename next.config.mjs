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
};

export default nextConfig;
