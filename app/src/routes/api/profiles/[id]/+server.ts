import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { updateProfile, deleteProfile } from '$lib/server/services/profiles';

export const PATCH: RequestHandler = ({ locals, params, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = await request.json().catch(() => ({}));
		return json({ profile: await updateProfile(db, user.id, Number(params.id), body) });
	});

export const DELETE: RequestHandler = ({ locals, params }) =>
	guard(async () => {
		const user = requireUser(locals);
		await deleteProfile(db, user.id, Number(params.id));
		return json({ ok: true });
	});
