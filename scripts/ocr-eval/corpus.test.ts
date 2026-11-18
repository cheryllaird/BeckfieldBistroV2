import { describe, it, expect } from 'vitest';
import { editedGroup, parseCsv, parseManifest } from './corpus';

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('drops blank lines and keeps a last line without a newline', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseManifest', () => {
  it('reads columns by name and treats common truthy marks as hand-checked', () => {
    const csv = 'layout,id,handChecked\ntwo-column,abc,yes\n,def,\ncard,ghi,X\n';
    expect(parseManifest(csv)).toEqual([
      { id: 'abc', layout: 'two-column', handChecked: true },
      { id: 'def', layout: '', handChecked: false },
      { id: 'ghi', layout: 'card', handChecked: true },
    ]);
  });

  it('requires an id column', () => {
    expect(() => parseManifest('layout\ncard\n')).toThrow(/id/);
  });
});

describe('editedGroup', () => {
  it('separates edited, unedited and unknown', () => {
    expect(editedGroup({ editedBeforeSave: ['steps'] })).toBe('edited');
    expect(editedGroup({ editedBeforeSave: [] })).toBe('unedited');
    expect(editedGroup({ editedBeforeSave: null })).toBe('unknown');
  });
});
