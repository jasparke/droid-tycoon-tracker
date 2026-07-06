// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { getReference } from '$lib/server/services/reference';
import type { listAllProfiles } from '$lib/server/services/profiles';
import type { counts } from '$lib/server/schema';

type SessionUser = { id: number; username: string };

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
		}
		// shape returned by src/routes/+layout.server.ts; the count/plan maps are
		// only present for authenticated pages, so they are optional here
		interface PageData {
			user: SessionUser | null;
			reference: Awaited<ReturnType<typeof getReference>> | null;
			profiles: Awaited<ReturnType<typeof listAllProfiles>>;
			countsByProfile?: Record<number, (typeof counts.$inferSelect)[]>;
			plansByCycle?: Record<number, Record<number, number[]>>;
		}
	}
}

export {};
