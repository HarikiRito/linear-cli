import { describe, expect, it } from 'vitest';
import { markdownTable } from '../src/lib/output/markdown.js';

describe('markdownTable', () => {
  it('renders header and separator row', () => {
    const out = markdownTable(['ID', 'Name'], []);
    expect(out).toContain('| ID | Name |');
    expect(out).toContain('| --- | --- |');
  });

  it('renders data rows', () => {
    const out = markdownTable(
      ['A', 'B'],
      [
        ['1', 'foo'],
        ['2', 'bar'],
      ]
    );
    expect(out).toContain('| 1 | foo |');
    expect(out).toContain('| 2 | bar |');
  });

  it('renders a complete table with 3 columns', () => {
    const out = markdownTable(['ID', 'Name', 'Key'], [['t1', 'Engineering', 'ENG']]);
    const lines = out.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('| ID | Name | Key |');
    expect(lines[1]).toBe('| --- | --- | --- |');
    expect(lines[2]).toBe('| t1 | Engineering | ENG |');
  });
});
