// Production build script.
//
// Produces:
//   dist/public/**   - the built client (static assets), served by
//                       server/static.ts in production
//   dist/index.cjs    - the bundled Express server, matching the
//                       `"start": "cross-env NODE_ENV=production node dist/index.cjs"`
//                       script in package.json
//
// Run via `npm run build` (-> `tsx script/build.ts`).

import { build as viteBuild } from "vite";
import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function buildClient() {
  console.log("[build] Building client (vite)...");
  // Reuses the existing vite.config.ts (root: client/, outDir: dist/public).
  await viteBuild();
  console.log("[build] Client build complete -> dist/public");
}

async function buildServer() {
  console.log("[build] Building server (esbuild)...");
  await esbuild.build({
    entryPoints: [path.resolve(rootDir, "server/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile: path.resolve(rootDir, "dist/index.cjs"),
    // Keep node_modules out of the bundle: native/optional deps (pg, ws,
    // bcrypt-style bindings, etc.) don't bundle reliably, and this keeps
    // the output small. `start` runs with node_modules present, so
    // externals resolve normally at runtime.
    packages: "external",
    sourcemap: false,
    minify: false,
    logLevel: "info",
  });
  console.log("[build] Server build complete -> dist/index.cjs");
}

async function main() {
  try {
    await buildClient();
    await buildServer();
    console.log("[build] Done.");
  } catch (err) {
    console.error("[build] Build failed:", err);
    process.exit(1);
  }
}

main();
