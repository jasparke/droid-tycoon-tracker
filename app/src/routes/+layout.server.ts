import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { getReference } from '$lib/server/services/reference';
import { listAllProfiles } from '$lib/server/services/profiles';

const PUBLIC = new Set(['/login', '/register']);

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		if (!PUBLIC.has(url.pathname)) redirect(303, '/login');
		return { user: null, reference: null, profiles: [] };
	}
	const [reference, profiles] = await Promise.all([getReference(db), listAllProfiles(db)]);
	return { user: locals.user, reference, profiles };
};
