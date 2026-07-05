import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // .ts tests run in node; .tsx component tests opt into jsdom via a
    // `// @vitest-environment jsdom` docblock on their first line.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
