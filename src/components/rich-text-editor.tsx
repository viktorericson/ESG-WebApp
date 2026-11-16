"use client";

import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button, Label, cx } from "@/components/ui";
import { parseRich, serializeRich, type Block, type BlockType, type Run } from "@/lib/rich-text";

/* ------------------------------------------------------------------ */
/* Konvertering mellem gemt tekst og editorens dokument                */
/* ------------------------------------------------------------------ */

const runToNode = (r: Run): JSONContent => ({
  type: "text",
  text: r.text,
  marks: [r.bold && { type: "bold" }, r.italic && { type: "italic" }, r.underline && { type: "underline" }].filter(Boolean) as JSONContent["marks"],
});

function blocksToDoc(blocks: Block[]): JSONContent {
  const content: JSONContent[] = [];
  for (const b of blocks) {
    const inline = b.runs.filter((r) => r.text).map(runToNode);
    if (b.type === "heading") content.push({ type: "heading", attrs: { level: 3 }, content: inline });
    else if (b.type === "paragraph") content.push({ type: "paragraph", content: inline });
    else {
      const listType = b.type === "bullet" ? "bulletList" : "orderedList";
      const item: JSONContent = { type: "listItem", content: [{ type: "paragraph", content: inline }] };
      const last = content[content.length - 1];
      if (last?.type === listType) last.content!.push(item);
      else content.push({ type: listType, content: [item] });
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function nodeRuns(node: JSONContent | undefined): Run[] {
  const runs: Run[] = [];
  for (const c of node?.content ?? []) {
    if (c.type === "hardBreak") runs.push({ text: " " });
    if (c.type !== "text" || !c.text) continue;
    const has = (t: string) => c.marks?.some((m) => m.type === t) || undefined;
    runs.push({ text: c.text, bold: has("bold"), italic: has("italic"), underline: has("underline") });
  }
  return runs;
}

function docToBlocks(doc: JSONContent): Block[] {
  const blocks: Block[] = [];
  const walk = (nodes: JSONContent[] | undefined, list?: BlockType) => {
    for (const n of nodes ?? []) {
      if (n.type === "paragraph") blocks.push({ type: list ?? "paragraph", runs: nodeRuns(n) });
      else if (n.type === "heading") blocks.push({ type: "heading", runs: nodeRuns(n) });
      // Indlejrede lister flades ud til ét niveau – det er det, PowerPoint-eksporten understøtter
      else if (n.type === "bulletList") walk(n.content, "bullet");
      else if (n.type === "orderedList") walk(n.content, "ordered");
      else if (n.type === "listItem") walk(n.content, list);
    }
  };
  walk(doc.content);
  return blocks.filter((b) => b.runs.some((r) => r.text.trim()));
}

const toText = (editor: Editor) => serializeRich(docToBlocks(editor.getJSON()));

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // mousedown, så editoren ikke mister markeringen, før kommandoen kører
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cx(
        "inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm text-neutral-700 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-brand-500",
        active && "bg-brand-100 text-brand-800",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, extra }: { editor: Editor; extra?: ReactNode }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      heading: e.isActive("heading"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label="Formatering" className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-1.5 py-1">
      <ToolButton label="Fed (Cmd+B)" active={s.bold} onClick={() => c().toggleBold().run()}>
        <b>F</b>
      </ToolButton>
      <ToolButton label="Kursiv (Cmd+I)" active={s.italic} onClick={() => c().toggleItalic().run()}>
        <i>K</i>
      </ToolButton>
      <ToolButton label="Understreget (Cmd+U)" active={s.underline} onClick={() => c().toggleUnderline().run()}>
        <u>U</u>
      </ToolButton>
      <span className="mx-1 h-4 w-px bg-neutral-300" aria-hidden="true" />
      <ToolButton label="Overskrift" active={s.heading} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        <span className="text-xs font-semibold">Overskrift</span>
      </ToolButton>
      <ToolButton label="Punktliste" active={s.bullet} onClick={() => c().toggleBulletList().run()}>
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="currentColor">
          <circle cx="2.5" cy="4" r="1.3" />
          <circle cx="2.5" cy="8" r="1.3" />
          <circle cx="2.5" cy="12" r="1.3" />
          <rect x="5.5" y="3.3" width="9" height="1.4" rx=".7" />
          <rect x="5.5" y="7.3" width="9" height="1.4" rx=".7" />
          <rect x="5.5" y="11.3" width="9" height="1.4" rx=".7" />
        </svg>
      </ToolButton>
      <ToolButton label="Nummereret liste" active={s.ordered} onClick={() => c().toggleOrderedList().run()}>
        <span className="text-xs font-semibold">1.</span>
      </ToolButton>
      <span className="mx-1 h-4 w-px bg-neutral-300" aria-hidden="true" />
      <ToolButton label="Fortryd (Cmd+Z)" onClick={() => s.canUndo && c().undo().run()}>
        <span aria-hidden="true">↶</span>
      </ToolButton>
      <ToolButton label="Gentag (Cmd+Shift+Z)" onClick={() => s.canRedo && c().redo().run()}>
        <span aria-hidden="true">↷</span>
      </ToolButton>
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
  );
}

export function RichTextEditor({
  id,
  value,
  onChange,
  disabled,
  minHeight = "8rem",
  autoFocus,
  labelledBy,
  toolbarExtra,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  minHeight?: string;
  autoFocus?: boolean;
  labelledBy?: string;
  toolbarExtra?: ReactNode;
}) {
  const lastEmitted = useRef(value);
  const editor = useEditor({
    // Undgår uoverensstemmelse mellem server og browser (Next.js)
    immediatelyRender: false,
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
    ],
    content: blocksToDoc(parseRich(value)),
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
        "aria-multiline": "true",
        role: "textbox",
        // Tailwind nulstiller lister og overskrifter, så de styles her (klasserne genereres, fordi de står i kildekoden)
        class: cx(
          "rich-text px-3 py-2 text-sm focus:outline-none",
          "[&_p]:mb-2 [&_li>p]:mb-0",
          "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-brand-900 [&>h3:first-child]:mt-0",
          "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:pl-1",
        ),
        style: `min-height:${minHeight}`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const next = toText(e);
      lastEmitted.current = next;
      onChange(next);
    },
  });

  // Ændres værdien udefra (fx "kopiér fra sidste år" eller den anden editor i modalen), opdateres editoren
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    if (toText(editor) !== value) editor.commands.setContent(blocksToDoc(parseRich(value)), { emitUpdate: false });
    lastEmitted.current = value;
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      className={cx(
        "overflow-hidden rounded-md border border-neutral-300 bg-white shadow-xs focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100",
        disabled && "opacity-70",
      )}
    >
      {editor && !disabled && <Toolbar editor={editor} extra={toolbarExtra} />}
      {editor ? <EditorContent editor={editor} /> : <div className="px-3 py-2 text-sm whitespace-pre-wrap text-neutral-700" style={{ minHeight }}>{value}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Felt med etiket, tæller og stor editor i et modalvindue            */
/* ------------------------------------------------------------------ */

export function RichTextField({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
  counter,
  minHeight = "8rem",
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  value: string | undefined;
  disabled: boolean;
  onChange: (v: string) => void;
  counter?: ReactNode;
  minHeight?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  const dialogTitleId = useId();
  const text = value ?? "";

  const expand = (
    <Button type="button" variant="ghost" className="h-7 px-2 py-0 text-xs" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
      </svg>
      Udvid
    </Button>
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label id={labelId} htmlFor={id}>
          {label}
        </Label>
        {counter}
      </div>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
      <div className="mt-1.5">
        <RichTextEditor id={id} labelledBy={labelId} value={text} onChange={onChange} disabled={disabled} minHeight={minHeight} toolbarExtra={expand} />
      </div>

      <dialog
        ref={dialog}
        aria-labelledby={dialogTitleId}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-lg border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
        // Klik på baggrunden lukker vinduet
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
          <h2 id={dialogTitleId} className="text-base font-semibold">
            {label}
          </h2>
          <div className="flex items-center gap-3">
            {counter}
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Færdig
            </Button>
          </div>
        </div>
        <div className="p-5">
          {hint && <p className="mb-2 text-xs text-neutral-500">{hint}</p>}
          <DialogEditor value={text} onChange={onChange} disabled={disabled} dialog={dialog} />
          <p className="mt-2 text-xs text-neutral-500">Gemmes automatisk. Fed, kursiv, understregning, overskrifter og lister kommer med i PowerPoint og PDF.</p>
        </div>
      </dialog>
    </div>
  );
}

/** Editoren i modalen monteres først, når vinduet åbnes, så den får fokus og den aktuelle tekst */
function DialogEditor({ value, onChange, disabled, dialog }: { value: string; onChange: (v: string) => void; disabled: boolean; dialog: RefObject<HTMLDialogElement | null> }) {
  const open = useDialogOpen(dialog);
  return open ? <RichTextEditor value={value} onChange={onChange} disabled={disabled} minHeight="min(60vh, 32rem)" autoFocus /> : null;
}

function useDialogOpen(dialog: RefObject<HTMLDialogElement | null>): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const sync = () => setOpen(d.open);
    const observer = new MutationObserver(sync);
    observer.observe(d, { attributes: true, attributeFilter: ["open"] });
    d.addEventListener("close", sync);
    return () => {
      observer.disconnect();
      d.removeEventListener("close", sync);
    };
  }, [dialog]);
  return open;
}
