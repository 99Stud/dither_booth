import type { ReactNode } from "react";

import clsx from "clsx";

/*
 * GitHub's release notes, as React elements: headings, bullet lists,
 * paragraphs, links, `code` and **bold**. Never HTML: the notes come from
 * the internet, and nothing in them reaches the page as markup.
 */

const INLINE =
  /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+)/gu;

const linkClass = clsx("break-all underline underline-offset-4");

export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className={clsx("rounded bg-muted px-1 font-mono text-xs")}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/u.exec(part);
    if (link) {
      return (
        <a
          key={index}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
        >
          {link[1]}
        </a>
      );
    }
    if (/^https?:\/\//u.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "paragraph"; text: string };

export function parseNotes(markdown: string): Block[] {
  const blocks: Block[] = [];

  for (const raw of markdown.replaceAll("\r\n", "\n").split("\n")) {
    const line = raw.trim();
    const last = blocks.at(-1);
    const heading = /^#{1,6}\s+(.*)$/u.exec(line);
    const item = /^[-*]\s+(.*)$/u.exec(line);

    if (!line) {
      if (last?.kind === "paragraph" || last?.kind === "list")
        blocks.push({ kind: "paragraph", text: "" });
    } else if (heading?.[1]) {
      blocks.push({ kind: "heading", text: heading[1] });
    } else if (item?.[1] !== undefined) {
      if (last?.kind === "list") last.items.push(item[1]);
      else blocks.push({ kind: "list", items: [item[1]] });
    } else if (last?.kind === "paragraph" && last.text) {
      last.text = `${last.text} ${line}`;
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }

  return blocks.filter((block) => block.kind !== "paragraph" || block.text);
}

/** The notes, laid out with the panel's own type. */
export const ReleaseNotesBody = ({ markdown }: { markdown: string }) => (
  <div className={clsx("flex flex-col gap-2 text-sm")}>
    {parseNotes(markdown).map((block, index) =>
      block.kind === "heading" ? (
        <p key={index} className={clsx("font-medium")}>
          {renderInline(block.text)}
        </p>
      ) : block.kind === "list" ? (
        <ul key={index} className={clsx("list-disc space-y-1 pl-5")}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      ) : (
        <p key={index} className={clsx("text-muted-foreground")}>
          {renderInline(block.text)}
        </p>
      ),
    )}
  </div>
);
