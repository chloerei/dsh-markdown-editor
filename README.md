# Markdown editor (Sidebar plugin)

A DSH bundle that turns the right Sidebar's document preview into a Markdown
editor: `.md`, `.markdown`, and `.mdx` files open directly into an editable
textarea, and `Ctrl/⌘+S` (or the toolbar's **保存**) writes the file back to
disk.

## What it registers

- A document implementation (`@local/dsh-markdown-editor/editor`) for `md`,
  `markdown`, and `mdx` in the document-preview registry, with
  `priority: 'extension'` and `loading: 'renderer'`, plus its body in the
  keyed `sidebar.right.tab.document` seat.
- Because an `extension`-band implementation outranks the builtin one, the
  editor is the **default** renderer for those suffixes. The builtin
  **Markdown** preview and **Plain text** stay selectable from the document's
  own viewer dropdown, and the choice is per tab.
- One authenticated Host route, `POST /api/dsh-markdown-editor/save`, on the
  shared `/api` channel.

## Why the body owns its read

A `renderer` implementation reads its own bytes through the workspace Remote
instead of letting the preview deliver them. That is deliberate. The preview
marks a tab stale whenever the watched file's version changes — and saving is
exactly such a change — then re-reads it. A `bytes-complete` implementation has
its body **unmounted** while that re-read runs, which flashed the whole editor
and discarded its focus and caret on every save. Reading the bytes here keeps
the body mounted across the preview's reload: the same textarea survives, the
caret stays put, and the incoming bytes are folded into the editor's basis
instead of replacing it.

## How saving works

The Client posts `{ path, text, baseText, bom, sessionId }` to the route. The
Host resolves the path through `ctx.fs` and applies the same session sandbox
policy the filesystem tools use, so a write outside the workspace (or under
`read-only`) is denied with the standard `[sandbox: …]` refusal; the write
itself is atomic through the backend.

`baseText` is the text the tab loaded. If the file no longer matches it, the
route answers `409` with the current disk text and the editor offers
**载入磁盘版本** / **覆盖保存** instead of clobbering another writer's change.

A leading UTF-8 byte-order mark is preserved across a round trip. It is
invisible, and a text read consumes it as an encoding signature, so both halves
look at the leading bytes instead: the Client decodes with `ignoreBOM` to tell
the mark apart from the text, and the Host re-reads the first three bytes when
it reports a conflict, so an edit never silently strips the mark from the file.

Once a save settles the editor takes focus back with the caret where it was: a
clicked **保存** or **覆盖保存** is disabled while saving, so the browser would
otherwise drop focus and the reader would have to click the textarea again to
keep typing. Focus is left alone when it already sits in the textarea or has
moved to a control outside the editor.

## Syntax highlighting

A backdrop `<pre>` renders the highlighted source under a transparent-text
`textarea`; the two share padding, font, size, line height, tab size, and
wrapping mode, and scroll together. The textarea always owns the text, so the
backdrop never changes what is stored or saved.

- Block constructs: ATX headings, fenced code blocks, thematic breaks, list
  markers, blockquotes, tables, HTML comments.
- Inline constructs: code spans, `**strong**`, `*em*`/`_em_` (intraword
  underscores stay plain), `~~strikethrough~~`, links and images with their
  target split out, autolinks, escapes.
- Colors come from the application's own `--shiki-*` sheet, so the editor
  matches the builtin code preview and follows light/dark themes with no
  override rules.
- An IME composition hands the text back to the textarea (the backdrop hides
  for the duration), so composing Chinese or Japanese stays legible.
- Above 120k characters the backdrop drops token colors but keeps rendering the
  text; per-line token results are cached, so typing in a long file only
  re-tokenizes the changed lines.
- The editor shows the host's themed scrollbar. Both layers reserve the same
  gutter (`scrollbar-gutter: stable`, the same 10px `::-webkit-scrollbar`
  width, `scrollbar-width: thin`), and the backdrop's own thumb is transparent,
  so exactly one scrollbar is visible and wrap points still line up.

## List input assistance

`Enter` inside a list item continues the list. An unordered marker repeats
verbatim, keeping its indentation and the spacing after the marker; an ordered
number advances and keeps its delimiter, so `1.` → `2.`, `9)` → `10)`, and a
zero-padded `01.` → `02.`. Pressing `Enter` on an item that holds nothing but a
marker ends the list by dropping that marker. `Shift+Enter`, a held modifier, an
active IME composition, a non-empty selection, and any line already inside a
fenced code block all insert a plain newline instead.

## Files

| File | Role |
|---|---|
| `index.js` | Host half: the save route and its validation/fencing |
| `client.js` | Client half: the editor body, its copy, styles, and shortcuts |
| `cordis.patch.yml` | Inserts the `markdown-editor` row |
| `locale/{zh,en}.json` | Plugin-card title and description |

## Environment note

This container had no `pnpm`, which the Harness plugin manager spawns for
install/remove. It is provided here by `/workspace/.tools/node_modules/pnpm`
(10.18.0) through the shim `/workspace/node_modules/.bin/pnpm`. A host restarted
from another working directory will not see that shim; installing pnpm on the
system `PATH` (for example `/usr/local/bin/pnpm`) makes plugin management
independent of the working directory.
