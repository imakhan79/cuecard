import { Fragment } from "react";

/** Tiny, safe renderer for the subset of Markdown Cuecard asks Claude for: paragraphs, **bold**, bullets, and "**Label:** text" sections. */
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

const SECTION = /^\*\*([^*:]{1,30}):\*\*\s*(.*)$|^\*\*([^*:]{1,30})\*\*:\s*(.*)$/;

const SECTION_TONE: Record<string, string> = {
  "key point": "border-accent bg-accent-soft",
  situation: "border-sky-500/60",
  task: "border-violet-500/60",
  action: "border-amber-500/60",
  result: "border-emerald-500/60",
  close: "border-border",
};

type Block =
  | { type: "p"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "section"; label: string; text: string };

export function Markdown({ text }: { text: string }) {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const section = line.trim().match(SECTION);
    const last = blocks[blocks.length - 1];
    if (section) {
      blocks.push({ type: "section", label: (section[1] ?? section[3]).trim(), text: (section[2] ?? section[4]).trim() });
    } else if (bullet) {
      if (last?.type === "ul") last.items.push(bullet[1]);
      else blocks.push({ type: "ul", items: [bullet[1]] });
    } else if (!line.trim()) {
      blocks.push({ type: "p", lines: [] });
    } else if (last?.type === "section" && last.text) {
      last.text += ` ${line.trim()}`; // wrapped continuation of a section
    } else {
      const heading = line.replace(/^#{1,6}\s+/, "");
      if (last?.type === "p" && last.lines.length) last.lines.push(heading);
      else blocks.push({ type: "p", lines: [heading] });
    }
  }

  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-fg/90">
      {blocks.map((b, i) => {
        if (b.type === "section") {
          const key = b.label.toLowerCase();
          const isKey = key === "key point";
          return (
            <div key={i} className={`rounded-r-lg border-l-4 py-1 pl-3 ${SECTION_TONE[key] ?? "border-accent/40"} ${isKey ? "rounded-lg py-2 font-medium text-fg" : ""}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{b.label}</p>
              <p className={isKey ? "text-base" : ""}>{inline(b.text)}</p>
            </div>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-accent">
              {b.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </ul>
          );
        }
        return b.lines.length ? <p key={i}>{inline(b.lines.join(" "))}</p> : null;
      })}
    </div>
  );
}
