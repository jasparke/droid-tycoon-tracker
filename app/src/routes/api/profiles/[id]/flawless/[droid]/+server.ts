import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser, intParam, decodeParam } from '$lib/server/respond';
import { setFlawless } from '$lib/server/services/flawless';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = (await request.json().catch(() => ({}))) ?? {};
		const res = await setFlawless(
			db, user.id, intParam(params.id, 'id'),
			decodeParam(params.droid, 'droid'), body.owned === true
		);
		return json(res);
	});
