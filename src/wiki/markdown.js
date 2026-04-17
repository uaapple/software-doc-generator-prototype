function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+={}\[\]|\\:;"'<>,.?/]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function renderInline(text = "") {
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let html = "";

  for (const match of text.matchAll(pattern)) {
    const [token, code, linkText, linkHref, boldText] = match;
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(cursor, index));
    if (code) {
      html += `<code>${escapeHtml(code)}</code>`;
    } else if (linkText && linkHref) {
      html += `<a href="${escapeHtml(linkHref)}">${escapeHtml(linkText)}</a>`;
    } else if (boldText) {
      html += `<strong>${escapeHtml(boldText)}</strong>`;
    } else {
      html += escapeHtml(token);
    }
    cursor = index + token.length;
  }

  html += escapeHtml(text.slice(cursor));
  return html;
}

function extractLinks(markdown = "") {
  const links = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    links.push({
      text: match[1],
      href: match[2]
    });
  }
  return links;
}

export function renderMarkdown(markdown = "") {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  const headings = [];
  const paragraph = [];
  let list = null;
  let codeFence = null;

  function flushParagraph() {
    if (paragraph.length === 0) {
      return;
    }
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  }

  function flushList() {
    if (!list || list.items.length === 0) {
      list = null;
      return;
    }
    const tag = list.type === "ordered" ? "ol" : "ul";
    html.push(`<${tag}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`);
    list = null;
  }

  function flushCodeFence() {
    if (!codeFence) {
      return;
    }
    const className = codeFence.language ? ` class="language-${escapeHtml(codeFence.language)}"` : "";
    html.push(`<pre><code${className}>${escapeHtml(codeFence.lines.join("\n"))}</code></pre>`);
    codeFence = null;
  }

  for (const line of lines) {
    if (codeFence) {
      if (line.startsWith("```")) {
        flushCodeFence();
      } else {
        codeFence.lines.push(line);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      codeFence = {
        language: line.slice(3).trim(),
        lines: []
      };
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = slugify(text);
      headings.push({ level, text, id });
      html.push(`<h${level} id="${escapeHtml(id)}">${renderInline(text)}</h${level}>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (!list || list.type !== "ordered") {
        flushList();
        list = { type: "ordered", items: [] };
      }
      list.items.push(orderedMatch[1].trim());
      continue;
    }

    const unorderedMatch = line.match(/^-\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (!list || list.type !== "unordered") {
        flushList();
        list = { type: "unordered", items: [] };
      }
      list.items.push(unorderedMatch[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCodeFence();

  return {
    html: html.join("\n"),
    headings,
    links: extractLinks(markdown)
  };
}
