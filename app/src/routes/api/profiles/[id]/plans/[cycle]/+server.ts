import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser, intParam } from '$lib/server/respond';
import { replacePlan } from '$lib/server/services/plans';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = (await request.json().catch(() => ({}))) ?? {};
		return json(
			await replacePlan(db, user.id, intParam(params.id, 'id'), intParam(params.cycle, 'cycle'), body.rebirths)
		);
	});
