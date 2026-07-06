import { describe, it, expect } from 'vitest';
import { toRows, cell } from './csv';

describe('csv', () => {
	it('parses rows and preserves embedded newline in a quoted cell', () => {
		const src = 'a,b,c\n1,"two\nlines",3\n';
		const rows = toRows(src);
		expect(rows[0]).toEqual(['a', 'b', 'c']);
		expect(rows[1][1]).toBe('two\nlines');
	});
	it('cell() is safe past the end of a short row', () => {
		expect(cell(['x'], 5)).toBe('');
		expect(cell(['x', 'y'], 1)).toBe('y');
	});
});
