/** @type {import('next').NextConfig} */
const nextConfig = {
  // sql.js's UMD wrapper (dist/sql-wasm.js) breaks when webpack bundles it
  // into the server/RSC chunk ("Cannot set properties of undefined (setting
  // 'exports')") — keep it as a plain Node require instead.
  experimental: {
    serverComponentsExternalPackages: ["sql.js"],
  },
};

export default nextConfig;
