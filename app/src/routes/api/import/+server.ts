import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { importCode } from '$lib/server/services/importer';

export const POST: RequestHandler = ({ locals, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = await request.json().catch(() => ({}));
		return json(await importCode(db, user.id, String(body.code ?? '')), { status: 201 });
	});
