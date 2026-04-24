// Minimal quoted-aware CSV parser. Handles "quoted,values,with commas" and
// "" as an escaped quote inside a quoted field. Returns rows of string cells.
export function parseCsv(input: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;
	let i = 0;

	while (i < input.length) {
		const ch = input[i];

		if (inQuotes) {
			if (ch === '"') {
				if (input[i + 1] === '"') {
					cell += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i += 1;
				continue;
			}
			cell += ch;
			i += 1;
			continue;
		}

		if (ch === '"') {
			inQuotes = true;
			i += 1;
			continue;
		}
		if (ch === ',') {
			row.push(cell);
			cell = '';
			i += 1;
			continue;
		}
		if (ch === '\r') {
			i += 1;
			continue;
		}
		if (ch === '\n') {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
			i += 1;
			continue;
		}
		cell += ch;
		i += 1;
	}

	if (cell.length > 0 || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	return rows;
}
