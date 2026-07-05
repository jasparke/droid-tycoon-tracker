import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser, intParam, decodeParam } from '$lib/server/respond';
import { setCount } from '$lib/server/services/counts';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = (await request.json().catch(() => ({}))) ?? {};
		const res = await setCount(
			db, user.id, intParam(params.id, 'id'), intParam(params.cycle, 'cycle'),
			decodeParam(params.droid, 'droid'), params.tier, Number(body.n)
		);
		return json(res);
	});
