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

  it('escapes pipe characters in cell values to avoid malformed table rows', () => {
    const out = markdownTable(['A', 'B'], [['foo|bar', 'baz']]);
    const lines = out.split('\n');
    // The data row must have the pipe escaped
    expect(lines[2]).toBe('| foo\\|bar | baz |');
    // Table still has exactly 3 rows (header, separator, data)
    expect(lines).toHaveLength(3);
  });

  it('collapses newlines in cell values to a space', () => {
    const out = markdownTable(['X'], [['line1\nline2'], ['cr\r\nlf']]);
    const lines = out.split('\n');
    expect(lines[2]).toBe('| line1 line2 |');
    expect(lines[3]).toBe('| cr lf |');
  });

  it('escapes pipe in header cells too', () => {
    const out = markdownTable(['Col|A', 'Col|B'], [['1', '2']]);
    expect(out.split('\n')[0]).toBe('| Col\\|A | Col\\|B |');
  });
});
