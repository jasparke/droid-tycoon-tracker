import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sessionCookieName } from '$lib/server/oidc-cookies';
import { logout } from '$lib/server/services/users';

export const POST: RequestHandler = async ({ cookies }) => {
	const name = sessionCookieName();
	const token = cookies.get(name);
	if (token) await logout(db, token);
	cookies.delete(name, { path: '/' });
	redirect(303, '/login');
};
