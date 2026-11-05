import { Fragment } from "react";

/**
 * A small Markdown renderer for award notes: headings, lists, tables, quotes
 * and bold. It builds React elements, never raw HTML, because part of a note
 * is commentary written by Claude from supplier documents.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        if (!/^\|[\s:-]+\|/.test(lines[i]) || /[a-z0-9]/i.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={`t${i}`} className="overflow-x-auto">
          <table>
            <thead><tr>{head?.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className={/^[\d,.₹ -]+$/.test(c) ? "num text-right" : ""}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*- /.test(lines[i])) items.push(lines[i++].replace(/^\s*- /, ""));
      out.push(<ul key={`u${i}`}>{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>);
      continue;
    }
    if (/^> /.test(line)) out.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
    else if (/^# /.test(line)) out.push(<h1 key={i}>{inline(line.slice(2))}</h1>);
    else if (/^## /.test(line)) out.push(<h2 key={i}>{inline(line.slice(3))}</h2>);
    else if (line.trim()) out.push(<p key={i}>{inline(line)}</p>);
    i++;
  }
  return <div className="prose-note grid gap-1">{out}</div>;
}

function inline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, k) => (p.startsWith("**") && p.endsWith("**") ? <strong key={k} className="font-medium">{p.slice(2, -2)}</strong> : <Fragment key={k}>{p}</Fragment>));
}
