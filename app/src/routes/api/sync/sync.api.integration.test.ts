import { describe, it, expect } from 'vitest';
import { GET as versionsGet } from './versions/+server';

describe('sync versions endpoint', () => {
	it('401 without a session', async () => {
		const res = await versionsGet({ locals: { user: null } } as never);
		expect(res.status).toBe(401);
	});
});
