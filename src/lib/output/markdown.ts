/**
 * Renders a list of objects as a Markdown table.
 * headers: column labels
 * rows: array of string arrays, one per row (must match headers length)
 */
export function markdownTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return [header, separator, body].filter(Boolean).join('\n');
}

export function printMarkdown(content: string): void {
  console.log(content);
}
