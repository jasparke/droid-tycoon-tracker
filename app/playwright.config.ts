import { defineConfig } from '@playwright/test';

// e2e runs against the throwaway test database, never the developer's dev db
const DATABASE_URL = 'postgres://dtt:dtt@localhost:5432/dtt_test';
const APP_ORIGIN = 'http://localhost:4173';
const IDP_ORIGIN = 'http://localhost:9099';

export default defineConfig({
	testDir: 'e2e',
	use: { baseURL: APP_ORIGIN },
	webServer: [
		{
			command: 'node e2e/support/fake-oidc-provider.mjs',
			port: 9099,
			env: { FAKE_OIDC_PORT: '9099', FAKE_OIDC_ISSUER: IDP_ORIGIN, FAKE_OIDC_CLIENT_ID: 'test-client' }
		},
		{
			// build, then apply migrations and the full reference seed to dtt_test
			// before the server accepts connections
			command: 'npm run build && node drizzle/migrate.mjs && node drizzle/seed.mjs && node build',
			port: 4173,
			env: {
				PORT: '4173',
				DATABASE_URL,
				// adapter-node defaults to assuming https when computing the request origin for its
				// CSRF check, so a plain http form POST (e.g. the shell's logout form) gets rejected
				// as cross-site without this — same requirement documented in docker-compose.yml
				ORIGIN: APP_ORIGIN,
				PUBLIC_BASE_URL: APP_ORIGIN,
				OIDC_ISSUER_URL: IDP_ORIGIN,
				OIDC_CLIENT_ID: 'test-client',
				OIDC_CLIENT_SECRET: 'test-secret',
				OIDC_REDIRECT_URI: `${APP_ORIGIN}/api/auth/oidc/callback`,
				OIDC_ALLOW_INSECURE: '1'
			}
		}
	]
});
