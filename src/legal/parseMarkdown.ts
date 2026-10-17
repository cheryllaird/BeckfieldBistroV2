// Parses the legal pages' Markdown (src/legal/*.md) into blocks for Markdown.tsx:
// headings, paragraphs, bulleted and numbered lists, and pipe tables. It covers
// only what those pages use, rather than pulling in a full Markdown library.

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^-\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;

const cells = (line: string) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function parseMarkdown(source: string): Block[] {
  const lines = source.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      i++;
      continue;
    }

    if (line.trim().startsWith('|')) {
      const header = cells(line);
      i += 2; // skip the | --- | separator row
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    const listMatch = line.match(BULLET) ? BULLET : line.match(NUMBERED) ? NUMBERED : null;
    if (listMatch) {
      const items: string[] = [];
      while (i < lines.length && listMatch.test(lines[i])) items.push(lines[i++].match(listMatch)![1]);
      blocks.push({ kind: 'list', ordered: listMatch === NUMBERED, items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      !lines[i].trim().startsWith('|')
    ) {
      para.push(lines[i++].trim());
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') });
  }
  return blocks;
}
