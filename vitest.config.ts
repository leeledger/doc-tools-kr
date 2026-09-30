import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The error beacon is off in tests, as in every build without PUBLIC_ERROR_BEACON_PATH (Polish P.18).
  define: { __ERROR_BEACON_PATH__: '""', __ID_PHOTO_AUTOFRAME__: 'true' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/helpers/image-data.ts'],
    testTimeout: 60_000,
  },
});
