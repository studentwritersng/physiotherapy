import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws on import unless resolved through the `react-server`
    // export condition, which only Next applies. Vitest gets the default entry
    // and every `src/server/**` module fails to load. Point it at the same empty
    // module the package itself ships for `react-server`.
    alias: {
      "server-only": resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    // Every integration file shares one Postgres database and truncates it in
    // beforeEach. Run files serially: in parallel, one file's TRUNCATE deletes
    // rows another file just inserted, and concurrent TRUNCATE ... CASCADE
    // deadlocks. Per-file isolation would need a schema per worker.
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
});
