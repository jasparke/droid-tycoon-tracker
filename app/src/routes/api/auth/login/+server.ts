import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { login } from '$lib/server/services/users';
import { guard } from '$lib/server/respond';
import { ApiError } from '$lib/server/api-error';

export const POST: RequestHandler = ({ request, cookies }) =>
	guard(async () => {
		const body = (await request.json().catch(() => {
			throw new ApiError(422, 'bad_json', 'Body must be JSON');
		})) ?? {};
		const { user, token, expiresAt } = await login(db, body);
		cookies.set('session', token, {
			path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, expires: expiresAt
		});
		return json({ user });
	});
