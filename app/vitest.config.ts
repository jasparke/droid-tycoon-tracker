import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'node:path';

export default defineConfig({
	// sveltekit() provides the $env/* and $app/* virtual modules that +server.ts route handlers
	// import transitively (via $lib/server/db). The explicit $lib alias below is kept for the
	// prior plain-vitest setup and is redundant with (but harmless alongside) the plugin's own.
	plugins: [sveltekit()],
	resolve: { alias: { $lib: path.resolve('./src/lib') } },
	test: { include: ['src/**/*.test.ts'] }
});
