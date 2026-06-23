import Table from 'cli-table3';

/**
 * Renders data as a pretty CLI table using cli-table3.
 * headers: column labels
 * rows: array of string arrays
 */
export function prettyTable(headers: string[], rows: string[][]): string {
  const table = new Table({ head: headers });
  for (const row of rows) {
    table.push(row);
  }
  return table.toString();
}

export function printTable(content: string): void {
  console.log(content);
}
