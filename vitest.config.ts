import { defineConfig } from 'vitest/config';

/**
 * Testkonfiguration für das gesamte Monorepo.
 *
 * - Standardumgebung ist Node (Backend, Domänenlogik, reine TS-Logik der Module).
 * - React-Komponententests (*.test.tsx) setzen ihre Umgebung per Kopfkommentar:
 *   `// @vitest-environment jsdom`
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '.data/**'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // scrypt-Hashing ist bewusst teuer – Testdateien parallel, Tests innerhalb sequenziell
    fileParallelism: true,
  },
});
