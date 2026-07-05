import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
	resolve: { alias: { $lib: path.resolve('./src/lib') } },
	test: { include: ['src/**/*.test.ts'] }
});
