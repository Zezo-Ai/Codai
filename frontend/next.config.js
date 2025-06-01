/** @type {import('next').NextConfig} */
const nextConfig = {
  // The appDir option is no longer needed in Next.js 13+ as it's now the default
  // experimental: {
  //   appDir: true,
  // },
  // Disable React Strict Mode to prevent double-mounting of components
  reactStrictMode: false,
  // Enable static export for Electron builds
  output: process.env.ELECTRON_BUILD ? 'export' : undefined,
  // Disable all dev indicators and dev tools UI
  devIndicators: false,
  // Specify directories that should be treated as root
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  // Configure logging directory
  serverRuntimeConfig: {
    PROJECT_ROOT: __dirname,
    LOGS_DIRECTORY: 'logs'
  },
}

module.exports = nextConfig