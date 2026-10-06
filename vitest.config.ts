import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Usage statistics are off in tests, as in every build without PUBLIC_USAGE_STATS=1 (brief USAGE).
  define: { __USAGE_STATS__: 'false', __USAGE_SAMPLE__: '1', __ID_PHOTO_AUTOFRAME__: 'true', __BG_REMOVE__: 'false', __BG_CLOUD__: 'false' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/helpers/image-data.ts'],
    testTimeout: 60_000,
  },
});
