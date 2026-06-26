export type PlainValue = string | string[] | null | undefined;

export interface PlainField {
  key: string;
  value: PlainValue;
}

function isMultiLine(v: string): boolean {
  return v.includes('\n');
}

function renderField(key: string, value: PlainValue): string | null {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) {
    const joined = value.filter(Boolean).join(', ');
    if (!joined) return null;
    return `${key}: ${joined}`;
  }
  if (isMultiLine(value)) {
    return `${key}: |<<\n${value}\n<<END`;
  }
  return `${key}: ${value}`;
}

/**
 * Render a single record in plain key:value format.
 * First line is the header: `<type>: <primaryId>`.
 * Null/undefined/empty fields are omitted.
 * Multi-line values use the |<<...<<END sentinel block.
 */
export function renderPlainRecord(type: string, primaryId: string, fields: PlainField[]): string {
  const lines: string[] = [`${type}: ${primaryId}`];
  for (const { key, value } of fields) {
    const line = renderField(key, value);
    if (line !== null) {
      lines.push(line);
    }
  }
  return lines.join('\n');
}

/**
 * Render a list of records in plain format separated by "---" lines.
 */
export function renderPlainList(
  type: string,
  records: { primaryId: string; fields: PlainField[] }[]
): string {
  return records.map((r) => renderPlainRecord(type, r.primaryId, r.fields)).join('\n---\n');
}
