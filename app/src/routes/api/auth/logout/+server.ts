import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { logout } from '$lib/server/services/users';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('session');
	if (token) await logout(db, token);
	cookies.delete('session', { path: '/' });
	redirect(303, '/login');
};
