import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { listAllProfiles, createProfile } from '$lib/server/services/profiles';

export const GET: RequestHandler = ({ locals }) =>
	guard(async () => {
		requireUser(locals);
		return json({ profiles: await listAllProfiles(db) });
	});

export const POST: RequestHandler = ({ locals, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = await request.json().catch(() => ({}));
		return json({ profile: await createProfile(db, user.id, body) }, { status: 201 });
	});
