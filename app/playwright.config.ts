import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	use: { baseURL: 'http://localhost:4173' },
	webServer: {
		command: 'npm run build && node build',
		port: 4173,
		env: {
			PORT: '4173',
			DATABASE_URL: 'postgres://dtt:dtt@localhost:5432/dtt',
			INVITE_CODE: 'e2e-invite',
			SESSION_SECRET: 'e2e-secret'
		}
	}
});
