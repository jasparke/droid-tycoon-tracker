import { defineConfig } from '@playwright/test';

// e2e runs against the throwaway test database, never the developer's dev db
const DATABASE_URL = 'postgres://dtt:dtt@localhost:5432/dtt_test';

export default defineConfig({
	testDir: 'e2e',
	use: { baseURL: 'http://localhost:4173' },
	webServer: {
		// build, then apply migrations and the full reference seed to dtt_test
		// before the server accepts connections
		command: 'npm run build && node drizzle/migrate.mjs && node drizzle/seed.mjs && node build',
		port: 4173,
		env: {
			PORT: '4173',
			DATABASE_URL,
			INVITE_CODE: 'e2e-invite',
			// adapter-node defaults to assuming https when computing the request origin for its
			// CSRF check, so a plain http form POST (e.g. the shell's logout form) gets rejected
			// as cross-site without this — same requirement documented in docker-compose.yml
			ORIGIN: 'http://localhost:4173'
		}
	}
});
