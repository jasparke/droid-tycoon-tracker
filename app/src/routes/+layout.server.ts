import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { getReference } from '$lib/server/services/reference';
import { listAllProfiles } from '$lib/server/services/profiles';
import { counts, plans } from '$lib/server/schema';

const PUBLIC = new Set(['/login', '/register']);

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		if (!PUBLIC.has(url.pathname)) redirect(303, '/login');
		return { user: null, reference: null, profiles: [] };
	}
	const [reference, profiles, allCounts, allPlans] = await Promise.all([
		getReference(db),
		listAllProfiles(db),
		db.select().from(counts),
		db.select().from(plans)
	]);
	const countsByProfile: Record<number, typeof allCounts> = {};
	for (const c of allCounts) (countsByProfile[c.profileId] ??= []).push(c);
	const plansTmp: Record<number, Record<number, number[]>> = {};
	for (const p of allPlans) ((plansTmp[p.profileId] ??= {})[p.cycle] ??= []).push(p.rebirth);
	return { user: locals.user, reference, profiles, countsByProfile, plansByCycle: plansTmp };
};
