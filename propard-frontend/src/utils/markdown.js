export function markdownToHtml(markdown = '') {
  const escapeHtml = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const safeUrl = value => /^(https?:\/\/|mailto:)/i.test(value.trim()) ? value.trim() : '#';
  let html = escapeHtml(String(markdown).replace(/\r\n?/g, '\n'));
  const codeBlocks = [];
  html = html.replace(/```([\w-]+)?\n([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.length;
    codeBlocks.push('<pre><code' + (language ? ' class="language-' + language + '"' : '') + '>' + code.replace(/\n$/, '') + '</code></pre>');
    return '@@CODEBLOCK' + index + '@@';
  });
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h3>$1</h3>').replace(/^# (.+)$/gm, '<h2>$1</h2>').replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>');
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/_([^_\n]+)_/g, '<em>$1</em>').replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  html = html.replace(/^(?:- |\* )(.+)$/gm, '<li>$1</li>').replace(/^\d+\. (.+)$/gm, '<li data-ordered="true">$1</li>');
  html = html.split('\n\n').map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (/^(<h[2-4]>|<blockquote>|<pre>|@@CODEBLOCK)/.test(trimmed)) return trimmed;
    if (/^<li(?: data-ordered="true")?>/.test(trimmed)) return /data-ordered/.test(trimmed) ? '<ol>' + trimmed + '</ol>' : '<ul>' + trimmed + '</ul>';
    return '<p>' + trimmed.replace(/\n/g, '<br />') + '</p>';
  }).join('');
  return html.replace(/@@CODEBLOCK(\d+)@@/g, (_, index) => codeBlocks[Number(index)]);
}
