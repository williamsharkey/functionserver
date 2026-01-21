// System App: Markdown Viewer
ALGO.app.name = 'Markdown Viewer';
ALGO.app.icon = '📑';

function _md_parseMarkdown(text) {
  let html = text
    // Code blocks (must be first)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links and images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Unordered lists
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>')
    // Blockquotes
    .replace(/^>\s*(.*$)/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap in paragraph
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  // Wrap consecutive li elements in ul
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');

  return html;
}

function _md_open(content, filename) {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  const name = filename || 'Markdown Viewer';
  const text = content || '# Welcome to Markdown Viewer\n\nOpen a `.md` file to view it here.\n\n## Features\n\n- Headers\n- **Bold** and *italic* text\n- `inline code`\n- Code blocks\n- Lists\n- Links\n- Images\n\n```javascript\nconsole.log("Hello!");\n```';

  const html = _md_parseMarkdown(text);

  ALGO.createWindow({
    title: name,
    icon: '📑',
    width: 600,
    height: 500,
    content: '<div style="padding:20px;overflow:auto;height:100%;background:#fff;color:#222;font-family:Georgia,serif;">' +
      '<style>' +
        '.md-content h1 { font-size:28px; border-bottom:2px solid #333; padding-bottom:8px; }' +
        '.md-content h2 { font-size:22px; border-bottom:1px solid #666; padding-bottom:6px; }' +
        '.md-content h3 { font-size:18px; }' +
        '.md-content code { background:#f0f0f0; padding:2px 6px; border-radius:3px; font-family:monospace; }' +
        '.md-content pre { background:#1a1a2e; color:#e8e0f0; padding:12px; border-radius:6px; overflow-x:auto; }' +
        '.md-content pre code { background:transparent; padding:0; }' +
        '.md-content blockquote { border-left:4px solid #666; margin:10px 0; padding-left:15px; color:#555; }' +
        '.md-content ul { padding-left:25px; }' +
        '.md-content a { color:#0066cc; }' +
        '.md-content hr { border:none; border-top:1px solid #ccc; margin:20px 0; }' +
      '</style>' +
      '<div class="md-content">' + html + '</div>' +
    '</div>'
  });
}

// Register as file handler for .md files
if (typeof ALGO !== 'undefined' && ALGO.registerFileType) {
  ALGO.registerFileType('md', _md_open);
}

window._md_open = _md_open;
window._md_parseMarkdown = _md_parseMarkdown;

_md_open();
