# Markdown editor (Sidebar plugin)

A DSH bundle that turns the right Sidebar's document preview into a Markdown
editor: `.md`, `.markdown`, and `.mdx` files open directly into an editable
textarea, and `Ctrl/⌘+S` (or the toolbar's **保存**) writes the file back to
disk.

## What it registers

- A document implementation (`@local/dsh-markdown-editor/editor`) for `md`,
  `markdown`, and `mdx` in the document-preview registry, with
  `priority: 'extension'` and `loading: 'bytes-complete'`, plus its body in the
  keyed `sidebar.right.tab.document` seat.
- Because an `extension`-band implementation outranks the builtin one, the
  editor is the **default** renderer for those suffixes. The builtin
  **Markdown** preview and **Plain text** stay selectable from the document's
  own viewer dropdown, and the choice is per tab.
- One authenticated Host route, `POST /api/dsh-markdown-editor/save`, on the
  shared `/api` channel.

## How saving works

The Client posts `{ path, text, baseText, bom, sessionId }` to the route. The
Host resolves the path through `ctx.fs` and applies the same session sandbox
policy the filesystem tools use, so a write outside the workspace (or under
`read-only`) is denied with the standard `[sandbox: …]` refusal; the write
itself is atomic through the backend.

`baseText` is the text the tab loaded. If the file no longer matches it, the
route answers `409` with the current disk text and the editor offers
**载入磁盘版本** / **覆盖保存** instead of clobbering another writer's change.
A leading UTF-8 byte-order mark is preserved across a round trip.

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
