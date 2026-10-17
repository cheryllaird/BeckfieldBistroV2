import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Pin the timezone before test workers fork so the date helpers (isoDate,
// getWeekDays, formatDayLabel) behave the same on every machine.
process.env.TZ = 'UTC';

// Kept separate from vite.config.ts so the PWA and Tailwind plugins never run
// during tests.
export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
      exclude: ['src/test/**', '**/*.test.{ts,tsx}'],
    },
    projects: [
      {
        // Pure logic: no DOM, no mocks.
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
        },
      },
      {
        // Components, hooks and the store.
        plugins: [react()],
        define: { __APP_VERSION__: JSON.stringify('test'), __APP_BUILD__: JSON.stringify('test') },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
});
