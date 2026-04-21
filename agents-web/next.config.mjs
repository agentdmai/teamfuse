/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 is a native module; keep it on the server only.
  serverExternalPackages: ["better-sqlite3"],
  // v0 binds to localhost only. This is a defense-in-depth reminder, not a server binding;
  // the actual bind address is set by the dev/start scripts in package.json.
  typedRoutes: false,
};

export default nextConfig;
