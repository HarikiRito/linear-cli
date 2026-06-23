/**
 * Escape a markdown table cell value:
 * - Replace literal `|` with `\|` to avoid breaking table structure.
 * - Collapse newlines/carriage returns to a single space (newlines break a table row).
 */
function escapeCell(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
}

/**
 * Renders a list of objects as a Markdown table.
 * headers: column labels
 * rows: array of string arrays, one per row (must match headers length)
 */
export function markdownTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.map(escapeCell).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`).join('\n');
  return [header, separator, body].filter(Boolean).join('\n');
}

export function printMarkdown(content: string): void {
  console.log(content);
}
