import "dotenv/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

import { cartographer } from "@replit/vite-plugin-cartographer";
import { devBanner } from "@replit/vite-plugin-dev-banner";

const isReplit =
  process.env.NODE_ENV !== "production" &&
  process.env.REPL_ID !== undefined;

export default defineConfig({
  plugins: [
    react({
      // Enable JSX optimization in production for faster runtime
      jsxImportSource: "react",
    }),
    runtimeErrorOverlay(),
    ...(isReplit ? [cartographer(), devBanner()] : []),
  ],

  root: path.resolve(import.meta.dirname, "client"),

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },

  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Optimization settings for faster builds and smaller bundles
    minify: "esbuild",
    rollupOptions: {
      output: {
        // Optimized code splitting for faster initial load
        manualChunks: {
          // Core vendor libraries
          "vendor-react": ["react", "react-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-recharts": ["recharts"],
          
          // Heavy libraries - lazy loaded only when needed
          "vendor-xlsx": ["xlsx"],
          "vendor-html2canvas": ["html2canvas"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    cssCodeSplit: true,
  },

  server: {
    host: "0.0.0.0",
    port: 5001, // frontend now runs on 5001
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.PORT || 5000}`, // backend
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Optimization hints for faster dev server
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@tanstack/react-query",
      "recharts",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
    ],
  },
});
