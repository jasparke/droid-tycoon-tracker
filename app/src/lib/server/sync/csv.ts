import { parse } from 'csv-parse/sync';

export function toRows(csv: string): string[][] {
	return parse(csv, { relax_column_count: true, skip_empty_lines: false }) as string[][];
}

export function cell(row: string[], i: number): string {
	return i < row.length ? row[i] : '';
}
