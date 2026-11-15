import { Fragment } from "react";

/** Tiny, safe renderer for the subset of Markdown Cuecard asks Claude for: paragraphs, **bold**, and bullets. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-fg">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks: Array<{ type: "p"; lines: string[] } | { type: "ul"; items: string[] }> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === "ul") last.items.push(bullet[1]);
      else blocks.push({ type: "ul", items: [bullet[1]] });
    } else if (!line.trim()) {
      blocks.push({ type: "p", lines: [] });
    } else {
      const heading = line.replace(/^#{1,6}\s+/, "");
      if (last?.type === "p" && last.lines.length) last.lines.push(heading);
      else blocks.push({ type: "p", lines: [heading] });
    }
  }

  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-fg/90">
      {blocks.map((b, i) =>
        b.type === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-accent">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : b.lines.length ? (
          <p key={i}>{inline(b.lines.join(" "))}</p>
        ) : null,
      )}
    </div>
  );
}
