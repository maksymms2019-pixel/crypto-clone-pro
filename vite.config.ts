import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// Plain Vite SPA — outputs static `dist/` ready for Vercel / Netlify drag-and-drop.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // wrapper module owns registration
      filename: "sw.js",
      devOptions: { enabled: false },
      includeAssets: ["favicon.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      manifest: false, // we ship our own /public/manifest.webmanifest
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/functions\//, /^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html-pages", networkTimeoutSeconds: 4 },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:js|css|woff2?)$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "assets-v1", expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://assets.coingecko.com",
            handler: "CacheFirst",
            options: { cacheName: "coin-images", expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { host: true, port: 8080 },
  build: { outDir: "dist", sourcemap: false },
});
