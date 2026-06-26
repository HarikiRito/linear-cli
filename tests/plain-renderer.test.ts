import { describe, expect, it } from 'vitest';
import { renderPlainList, renderPlainRecord } from '../src/lib/output/plain.js';

describe('renderPlainRecord', () => {
  it('renders type: primaryId header', () => {
    const out = renderPlainRecord('Issue', 'ENG-42', []);
    expect(out).toContain('Issue: ENG-42');
  });

  it('renders key: value lines', () => {
    const out = renderPlainRecord('Issue', 'ENG-42', [
      { key: 'title', value: 'My issue' },
      { key: 'state', value: 'In Progress' },
    ]);
    expect(out).toContain('title: My issue');
    expect(out).toContain('state: In Progress');
  });

  it('omits null fields', () => {
    const out = renderPlainRecord('Issue', 'ENG-1', [
      { key: 'assignee', value: null },
      { key: 'title', value: 'Hello' },
    ]);
    expect(out).not.toContain('assignee:');
    expect(out).toContain('title: Hello');
  });

  it('omits undefined fields', () => {
    const out = renderPlainRecord('Issue', 'ENG-1', [
      { key: 'dueDate', value: undefined },
      { key: 'title', value: 'Hi' },
    ]);
    expect(out).not.toContain('dueDate:');
    expect(out).toContain('title: Hi');
  });

  it('omits empty string fields', () => {
    const out = renderPlainRecord('Issue', 'ENG-1', [
      { key: 'project', value: '' },
      { key: 'title', value: 'Non-empty' },
    ]);
    expect(out).not.toContain('project:');
  });

  it('renders multi-line value with |<< sentinel', () => {
    const out = renderPlainRecord('Issue', 'ENG-1', [
      { key: 'description', value: 'Line one\nLine two' },
    ]);
    expect(out).toContain('description: |<<');
    expect(out).toContain('Line one');
    expect(out).toContain('Line two');
    expect(out).toContain('<<END');
  });

  it('renders array value joined with commas', () => {
    const out = renderPlainRecord('Issue', 'ENG-1', [
      { key: 'labels', value: ['bug', 'feature', 'urgent'] },
    ]);
    expect(out).toContain('labels: bug, feature, urgent');
  });

  it('omits empty array', () => {
    const out = renderPlainRecord('Issue', 'ENG-1', [
      { key: 'labels', value: [] },
    ]);
    expect(out).not.toContain('labels:');
  });
});

describe('renderPlainList', () => {
  it('renders multiple records separated by ---', () => {
    const out = renderPlainList('Issue', [
      { primaryId: 'ENG-1', fields: [{ key: 'title', value: 'First' }] },
      { primaryId: 'ENG-2', fields: [{ key: 'title', value: 'Second' }] },
    ]);
    expect(out).toContain('Issue: ENG-1');
    expect(out).toContain('Issue: ENG-2');
    expect(out).toContain('---');
  });

  it('returns empty string for empty list', () => {
    const out = renderPlainList('Issue', []);
    expect(out).toBe('');
  });

  it('single record has no --- separator', () => {
    const out = renderPlainList('Issue', [
      { primaryId: 'ENG-1', fields: [{ key: 'title', value: 'Only' }] },
    ]);
    expect(out).not.toContain('---');
  });
});
