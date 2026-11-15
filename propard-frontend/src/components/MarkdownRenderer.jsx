import React from 'react';

const safeHref = value => {
  const href = value.trim();
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
};

function renderInline(text, prefix = 'i') {
  const tick = String.fromCharCode(96);
  const pattern = new RegExp('(\\[[^\\]]+\\]\\([^)]+\\)|\\*\\*[^*]+\\*\\*|__[^_]+__|~~[^~]+~~|\\*[^*]+\\*|_[^_]+_|' + tick + '[^' + tick + ']+' + tick + ')', 'g');
  return String(text).split(pattern).map((part, index) => {
    const key = prefix + '-' + index;
    if (!part) return null;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      return href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{renderInline(link[1], key)}</a> : <span key={key}>{link[1]}</span>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>;
    if (part.startsWith('__') && part.endsWith('__')) return <strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <del key={key}>{renderInline(part.slice(2, -2), key)}</del>;
    if (part.startsWith(tick) && part.endsWith(tick)) return <code key={key} className="propard-ai-inline-code">{part.slice(1, -1)}</code>;
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) return <em key={key}>{renderInline(part.slice(1, -1), key)}</em>;
    return part;
  });
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function parseTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

export default function MarkdownRenderer({ content = '' }) {
  const lines = String(content).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)/);
    if (fence) {
      const marker = fence[1][0];
      const codeLines = [];
      index += 1;
      while (index < lines.length && !new RegExp('^\\s*' + marker + '{3,}\\s*$').test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<pre className="propard-ai-code-block" key={'b-' + blocks.length}><code>{codeLines.join('\n')}</code></pre>);
      continue;
    }

    if (index + 1 < lines.length && isTableRow(line) && isSeparator(lines[index + 1])) {
      const headers = parseTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="propard-ai-table-wrap" key={'b-' + blocks.length}>
          <table className="propard-ai-table">
            <thead><tr>{headers.map((cell, i) => <th key={i}>{renderInline(cell, 'th-' + i)}</th>)}</tr></thead>
            <tbody>{rows.map((row, ri) => <tr key={ri}>{headers.map((_, ci) => <td key={ci}>{renderInline(row[ci] || '', 'td-' + ri + '-' + ci)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(React.createElement('h' + level, { key: 'b-' + blocks.length, className: 'propard-ai-heading' }, renderInline(heading[2], 'h-' + blocks.length)));
      index += 1;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr className="propard-ai-rule" key={'b-' + blocks.length} />);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote className="propard-ai-quote" key={'b-' + blocks.length}>{renderInline(quote.join('\n'), 'q-' + blocks.length)}</blockquote>);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (index < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/).test(lines[index])) {
        items.push(lines[index].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, ''));
        index += 1;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag className="propard-ai-list" key={'b-' + blocks.length}>{items.map((item, i) => <li key={i}>{renderInline(item, 'li-' + i)}</li>)}</Tag>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^\s*(#{1,6}\s|\`\`\`|~~~|>|[-*+]\s+|\d+[.)]\s+)/.test(lines[index]) && !(index + 1 < lines.length && isTableRow(lines[index]) && isSeparator(lines[index + 1]))) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p className="propard-ai-paragraph" key={'b-' + blocks.length}>{renderInline(paragraph.join('\n'), 'p-' + blocks.length)}</p>);
  }

  return <div className="propard-ai-markdown">{blocks}</div>;
}
