/**
 * Small, deterministic Markdown renderer for the policy pack.
 *
 * The source documents only use headings, paragraphs, ordered/unordered lists, bold spans and
 * GFM tables. Keeping the renderer here avoids shipping a Markdown runtime dependency to a page
 * whose content is trusted and build-time only. It escapes all text before adding markup.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" rel="noreferrer">$1</a>',
    );
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:|-]+\|?$/.test(line) && line.includes("-");
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isBlockStart(line: string, next?: string): boolean {
  return (
    !line.trim() ||
    /^#{1,4}\s/.test(line) ||
    /^---+$/.test(line.trim()) ||
    /^[-*]\s/.test(line) ||
    /^\d+\.\s/.test(line) ||
    (line.trim().startsWith("|") && Boolean(next && isTableSeparator(next)))
  );
}

function renderTable(header: string, rows: string[]): string {
  const head = splitRow(header)
    .map((cell) => `<th>${inline(cell)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${splitRow(row)
          .map((cell) => `<td>${inline(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="policy-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderPolicyMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const next = lines[index + 1];

    if (!trimmed) {
      index += 1;
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      output.push("<hr />");
      index += 1;
      continue;
    }
    if (/^##\s+/.test(line)) {
      output.push(`<h2>${inline(line.replace(/^##\s+/, "").trim())}</h2>`);
      index += 1;
      continue;
    }
    if (/^###\s+/.test(line)) {
      output.push(`<h3>${inline(line.replace(/^###\s+/, "").trim())}</h3>`);
      index += 1;
      continue;
    }
    if (/^####\s+/.test(line)) {
      output.push(`<h4>${inline(line.replace(/^####\s+/, "").trim())}</h4>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("|") && next && isTableSeparator(next)) {
      const header = trimmed;
      index += 2;
      const rows: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(lines[index].trim());
        index += 1;
      }
      output.push(renderTable(header, rows));
      continue;
    }

    const unordered = /^[-*]\s+/.test(line);
    const ordered = /^\d+\.\s+/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      let current = "";
      while (index < lines.length) {
        const candidate = lines[index];
        const startsItem = unordered
          ? /^[-*]\s+/.test(candidate)
          : /^\d+\.\s+/.test(candidate);
        if (startsItem) {
          if (current) items.push(current);
          current = candidate.replace(/^([-*]|\d+\.)\s+/, "").trim();
          index += 1;
          continue;
        }
        // Policy lists use indented continuation lines for wrapped prose.
        if (current && /^\s{2,}\S/.test(candidate)) {
          current += ` ${candidate.trim()}`;
          index += 1;
          continue;
        }
        break;
      }
      if (current) items.push(current);
      const tag = unordered ? "ul" : "ol";
      output.push(
        `<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !isBlockStart(lines[index], lines[index + 1])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length > 0) {
      output.push(`<p>${inline(paragraph.join(" "))}</p>`);
    } else {
      // Defensive: never loop forever on malformed input.
      index += 1;
    }
  }

  return output.join("\n");
}
