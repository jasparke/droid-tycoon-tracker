import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { register, createSession } from '$lib/server/services/users';
import { guard } from '$lib/server/respond';
import { ApiError } from '$lib/server/api-error';

export const POST: RequestHandler = ({ request, cookies }) =>
	guard(async () => {
		const body = await request.json().catch(() => {
			throw new ApiError(422, 'bad_json', 'Body must be JSON');
		});
		const user = await register(db, body, env.INVITE_CODE ?? '');
		const s = await createSession(db, user.id);
		cookies.set('session', s.token, {
			path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, expires: s.expiresAt
		});
		return json({ user }, { status: 201 });
	});
