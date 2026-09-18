// Runtime resolver for the compiled AI-contract tests.
//
// `tsc` deliberately does NOT rewrite tsconfig "paths" aliases, so a compiled
// `require("@/lib/schema")` would blow up at runtime. The existing ask-your-data
// suite dodges this only because every one of its `@/` imports is type-only
// (and therefore erased) — `lib/ai/contracts.ts` imports `defaultFileConfig` as
// a VALUE, so it really is required at runtime.
//
// This hook maps "@/<path>" onto the compiled output, falling back to the repo
// root. Loaded via `node --require`, so it is installed before any test module.
//
// Note: the compiled contracts.js also requires `nanoid` (ESM-only), which
// needs Node >= 22 for require() from CommonJS.

const path = require("node:path");
const Module = require("node:module");

const roots = [
  path.resolve(__dirname, "dist"), // what `tsc -p tests/ai-contracts` emits
  path.resolve(__dirname, "..", ".."), // repo root, in case that ever changes
];

const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (typeof request === "string" && request.startsWith("@/")) {
    const relative = request.slice(2);
    for (const root of roots) {
      try {
        return resolveFilename.call(this, path.join(root, relative), ...rest);
      } catch (err) {
        if (err && err.code !== "MODULE_NOT_FOUND") throw err;
      }
    }
  }
  return resolveFilename.call(this, request, ...rest);
};
