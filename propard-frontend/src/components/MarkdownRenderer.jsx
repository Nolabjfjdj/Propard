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
  const [copiedBlock, setCopiedBlock] = React.useState(null);
  const copyCode = async (code, blockIndex) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedBlock(blockIndex);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (copied) setCopiedBlock(blockIndex);
    }
  };
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
      const code = codeLines.join('\n');
      const blockIndex = blocks.length;
      blocks.push(
        <div className="propard-ai-code-wrap" key={'b-' + blockIndex}>
          <button type="button" className="propard-ai-copy-code" onClick={() => copyCode(code, blockIndex)} aria-label={copiedBlock === blockIndex ? 'Code copié' : 'Copier le code'} title={copiedBlock === blockIndex ? 'Code copié' : 'Copier le code'}>
            {copiedBlock === blockIndex ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>}
          </button>
          <pre className="propard-ai-code-block"><code>{code}</code></pre>
        </div>
      );
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

  return <div className="propard-ai-markdown"><style>{`.propard-ai-markdown{width:100%;min-width:0;overflow-wrap:anywhere}.propard-ai-markdown>*:first-child{margin-top:0}.propard-ai-markdown>*:last-child{margin-bottom:0}.propard-ai-paragraph{margin:0 0 12px;white-space:pre-wrap}.propard-ai-heading{font-weight:750;line-height:1.3;margin:18px 0 9px}.propard-ai-heading:first-child{margin-top:0}.propard-ai-markdown h1{font-size:1.55em}.propard-ai-markdown h2{font-size:1.35em}.propard-ai-markdown h3{font-size:1.15em}.propard-ai-list{margin:8px 0 14px;padding-left:24px}.propard-ai-list li{padding-left:3px;margin:4px 0}.propard-ai-markdown a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}.propard-ai-inline-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:5px;padding:2px 5px;font-size:.9em}.propard-ai-code-wrap{position:relative;max-width:100%;margin:10px 0 14px}.propard-ai-code-block{max-width:100%;overflow:auto;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:40px 12px 12px;margin:0}.propard-ai-copy-code{position:absolute;top:7px;right:7px;z-index:1;width:30px;height:30px;min-width:30px;min-height:30px;padding:6px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:7px;background:var(--bg-tertiary);color:var(--text-primary);cursor:pointer}.propard-ai-copy-code:hover{background:var(--bg-secondary)}.propard-ai-copy-code svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.propard-ai-code-block code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre}.propard-ai-table-wrap{max-width:100%;overflow-x:auto;margin:10px 0 14px;border:1px solid var(--border);border-radius:9px}.propard-ai-table{border-collapse:collapse;width:max-content;min-width:100%;font-size:12px;table-layout:auto}.propard-ai-table th,.propard-ai-table td{padding:8px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border);overflow-wrap:normal;word-break:normal;hyphens:none}.propard-ai-table th{font-weight:750;background:var(--bg-tertiary)}.propard-ai-table tr:last-child td{border-bottom:0}.propard-ai-quote{margin:10px 0;padding:8px 12px;border-left:3px solid var(--accent);background:var(--bg-tertiary);border-radius:0 7px 7px 0}.propard-ai-rule{border:0;border-top:1px solid var(--border);margin:14px 0}`}</style>{blocks}</div>;
}
