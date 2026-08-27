/**
 * Lets `node --test` load the app's TypeScript directly.
 *
 * Node 22.6+ strips TypeScript types natively, so no compiler or bundler is
 * needed to run these tests — but its ESM resolver still wants a file
 * extension, while the app's source (and Next.js) uses extensionless imports
 * like `./nutrition`. This hook fills that one gap and does nothing else, so
 * the tests exercise exactly the files the app ships rather than a build of
 * them.
 *
 * Deliberately dependency-free: a test suite that needs a toolchain installed
 * is a test suite that stops being run.
 */

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;
const CANDIDATES = [".ts", ".tsx", "/index.ts"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith(".") || HAS_EXTENSION.test(specifier)) {
      return nextResolve(specifier, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      const base = new URL(specifier, context.parentURL).href;
      for (const ext of CANDIDATES) {
        if (existsSync(fileURLToPath(new URL(base + ext)))) {
          return nextResolve(base + ext, context);
        }
      }
      throw err;
    }
  },
});
