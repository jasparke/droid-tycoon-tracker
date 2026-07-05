import { describe, it, expect } from 'vitest';
import { intParam, decodeParam } from './respond';
import { ApiError } from './api-error';

describe('intParam', () => {
	it('parses an integer string', () => {
		expect(intParam('42', 'id')).toBe(42);
	});
	it('rejects a non-integer with 422 bad_param', () => {
		let err: unknown;
		try {
			intParam('x', 'id');
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(ApiError);
		expect(err).toMatchObject({ status: 422, code: 'bad_param' });
	});
});

describe('decodeParam', () => {
	it('decodes a percent-encoded value', () => {
		expect(decodeParam('R2%2DD2', 'droid')).toBe('R2-D2');
	});
	it('rejects malformed encoding with 422 bad_param', () => {
		let err: unknown;
		try {
			decodeParam('%', 'droid');
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(ApiError);
		expect(err).toMatchObject({ status: 422, code: 'bad_param' });
	});
});
