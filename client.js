/**
 * Client half of the Markdown editor bundle.
 *
 * Registers a document implementation for Markdown suffixes that loads the
 * complete file and edits it in a textarea. Highlighting is drawn by a
 * backdrop `<pre>` under a transparent-text textarea: the two share every box
 * metric and scroll together, and the token colors come from the application's
 * own `--shiki-*` sheet, so light and dark themes need no extra rules.
 *
 * Saving posts the text to the Host half's route; the builtin Markdown preview
 * stays selectable from the document's own viewer dropdown.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-markdown-editor',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Implementation identity shared by the registry entry and the keyed body. */
    const EDITOR_ID = '@local/dsh-markdown-editor/editor';
    /** Suffixes this implementation claims; the editor wins over the builtin preview. */
    const EXTENSIONS = ['md', 'markdown', 'mdx'];
    /** Host route that writes the opened file. */
    const SAVE_ROUTE = '/api/dsh-markdown-editor/save';
    /** Client locale namespace of this bundle's copy. */
    const NS = 'markdownEditor';
    /** Source length above which the backdrop drops token colors but keeps the text. */
    const HIGHLIGHT_LIMIT = 120000;
    /** Bound on the retained per-line token cache. */
    const LINE_CACHE_LIMIT = 4000;

    const zh = {
      'viewer.editor': 'Markdown 编辑器',
      'action.save': '保存',
      'action.discard': '放弃修改',
      'action.adopt': '采用磁盘版本',
      'action.keep': '保留我的修改',
      'action.overwrite': '覆盖保存',
      'action.loadDisk': '载入磁盘版本',
      'hint.shortcut': 'Ctrl/⌘+S',
      'status.saved': '已保存',
      'status.unsaved': '未保存',
      'status.saving': '保存中…',
      'status.failed': '保存失败',
      'notice.changed': '文件已在磁盘上被修改。',
      'notice.conflict': '文件已被其他写入修改，你的修改尚未保存。',
      'error.noPath': '尚未取得文件的绝对路径，暂时无法保存。',
      'error.decode': '文件不是有效的 UTF-8 文本，无法在这里编辑。',
      'error.loadFailed': '无法读取文件内容。',
      'error.saveFailed': '保存失败',
      'waiting': '正在读取文件…',
    };

    const en = {
      'viewer.editor': 'Markdown editor',
      'action.save': 'Save',
      'action.discard': 'Discard changes',
      'action.adopt': 'Use disk version',
      'action.keep': 'Keep my edits',
      'action.overwrite': 'Overwrite',
      'action.loadDisk': 'Load disk version',
      'hint.shortcut': 'Ctrl/⌘+S',
      'status.saved': 'Saved',
      'status.unsaved': 'Unsaved changes',
      'status.saving': 'Saving…',
      'status.failed': 'Save failed',
      'notice.changed': 'This file changed on disk.',
      'notice.conflict': 'Another write changed this file; your edit was not saved.',
      'error.noPath': 'The file has no absolute path yet, so it cannot be saved.',
      'error.decode': 'This file is not valid UTF-8 text, so it cannot be edited here.',
      'error.loadFailed': 'The file contents could not be read.',
      'error.saveFailed': 'The file could not be saved.',
      'waiting': 'Reading the file…',
    };

    const CSS = [
      '.dsh-markdown-editor{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;white-space:normal;font-family:var(--dsw-font-family);}',
      '.dsh-markdown-editor-bar{display:flex;align-items:center;gap:8px;flex:none;flex-wrap:wrap;white-space:normal;padding:6px 10px 6px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size-secondary,12px);}',
      '.dsh-markdown-editor-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-success-primary);}',
      '.dsh-markdown-editor-dot[data-dirty="true"]{background:var(--dsw-alias-state-warn-primary);}',
      '.dsh-markdown-editor-dot[data-busy="true"]{background:var(--dsw-alias-state-idle-primary);}',
      '.dsh-markdown-editor-spacer{flex:1 1 auto;}',
      '.dsh-markdown-editor-hint{color:var(--dsw-alias-label-secondary);font-size:11px;opacity:.8;}',
      '.dsh-markdown-editor-button{height:24px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,6px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;}',
      '.dsh-markdown-editor-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);}',
      '.dsh-markdown-editor-button:disabled{opacity:.45;cursor:default;}',
      '.dsh-markdown-editor-button[data-primary="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}',
      '.dsh-markdown-editor-notice{display:flex;align-items:center;gap:8px;flex:none;flex-wrap:wrap;padding:6px 10px;background:var(--dsw-alias-bg-layer-2);border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:12px;white-space:normal;}',
      '.dsh-markdown-editor-note{margin:0;padding:10px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:normal;}',
      '.dsh-markdown-editor-error{margin:0;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:normal;}',
      '.dsh-markdown-editor-surface{position:relative;flex:1 1 auto;min-height:12rem;overflow:hidden;}',
      '.dsh-markdown-editor-highlight,.dsh-markdown-editor-input{position:absolute;inset:0;box-sizing:border-box;margin:0;padding:10px 12px;border:0;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.6;tab-size:2;white-space:pre;overflow:auto;scrollbar-gutter:stable;scrollbar-width:thin;}',
      '.dsh-markdown-editor-highlight{scrollbar-color:transparent transparent;}',
      '.dsh-markdown-editor-input{scrollbar-color:var(--dsh-scrollbar-thumb,var(--dsw-alias-scrollbar-bg-l2,rgba(128,128,128,.4))) transparent;}',
      '.dsh-markdown-editor-highlight::-webkit-scrollbar,.dsh-markdown-editor-input::-webkit-scrollbar{width:10px;height:10px;}',
      '.dsh-markdown-editor-highlight::-webkit-scrollbar-thumb,.dsh-markdown-editor-highlight::-webkit-scrollbar-track,.dsh-markdown-editor-highlight::-webkit-scrollbar-corner{background:transparent;}',
      '.dsh-markdown-editor-input::-webkit-scrollbar-track{background:transparent;margin:2px;}',
      '.dsh-markdown-editor-input::-webkit-scrollbar-corner{background:transparent;}',
      '.dsh-markdown-editor-input::-webkit-scrollbar-thumb{background:var(--dsh-scrollbar-thumb,var(--dsw-alias-scrollbar-bg-l2,rgba(128,128,128,.4)));border-radius:5px;}',
      '.dsh-markdown-editor-input::-webkit-scrollbar-thumb:hover{background:var(--dsh-scrollbar-thumb-hover,var(--dsw-alias-scrollbar-hover-l2,rgba(128,128,128,.6)));}',
      '.dsh-markdown-editor-highlight{pointer-events:none;z-index:0;color:var(--shiki-foreground,var(--dsw-alias-label-primary));background:transparent;}',
      '.dsh-markdown-editor-highlight code{font:inherit;background:none;padding:0;}',
      '.dsh-markdown-editor-input{z-index:1;resize:none;outline:none;background:transparent;color:transparent;caret-color:var(--dsw-alias-label-primary);}',
      '.dsh-markdown-editor-input::selection{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);}',
      '.dsh-markdown-editor[data-wrap="true"] .dsh-markdown-editor-highlight,.dsh-markdown-editor[data-wrap="true"] .dsh-markdown-editor-input{white-space:pre-wrap;overflow-wrap:anywhere;}',
      '.dsh-markdown-editor[data-composing="true"] .dsh-markdown-editor-highlight{visibility:hidden;}',
      '.dsh-markdown-editor[data-composing="true"] .dsh-markdown-editor-input{color:var(--dsw-alias-label-primary);}',
      '.dsh-mdm-marker{color:var(--shiki-token-keyword);}',
      '.dsh-mdm-fence{color:var(--shiki-token-keyword);}',
      '.dsh-mdm-hr{color:var(--shiki-token-punctuation);}',
      '.dsh-mdm-heading{color:var(--shiki-token-constant);font-weight:600;}',
      '.dsh-mdm-strong{color:var(--shiki-token-function);font-weight:600;}',
      '.dsh-mdm-em{color:var(--shiki-token-function);font-style:italic;}',
      '.dsh-mdm-strike{color:var(--shiki-token-comment);text-decoration:line-through;}',
      '.dsh-mdm-code{color:var(--shiki-token-string);}',
      '.dsh-mdm-code-line{color:var(--shiki-token-string-expression);}',
      '.dsh-mdm-quote{color:var(--shiki-token-comment);}',
      '.dsh-mdm-table{color:var(--shiki-token-parameter);}',
      '.dsh-mdm-link{color:var(--shiki-token-link);}',
      '.dsh-mdm-image{color:var(--shiki-token-parameter);}',
      '.dsh-mdm-url{color:var(--shiki-token-string-expression);}',
      '.dsh-mdm-punct{color:var(--shiki-token-punctuation);}',
      '.dsh-mdm-escape{color:var(--shiki-token-parameter);}',
      '.dsh-mdm-comment{color:var(--shiki-token-comment);font-style:italic;}',
    ].join('');

    /** Bound translate of the active locale; replaced when the plugin applies. */
    let translate = (key) => key;
    /** Locale service, so an open editor re-renders on a locale switch. */
    let localeService;
    /** Per-line token results keyed by `(in fence, line)`. */
    const lineCache = new Map();
    /**
     * Read one file's complete bytes through the workspace Remote. The editor
     * owns its content loading (a `renderer` implementation), so a save that
     * changes the file's version re-reads without the preview unmounting the
     * body. Replaced by `apply` once the Remote face is available.
     */
    let readBytes = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'gateway/service-unavailable', message: translate('error.loadFailed') },
      });

    /**
     * Decode complete file bytes as UTF-8. `ignoreBOM: true` keeps a leading
     * byte-order mark as the first character so it can be detected and stripped
     * from the editable text while the draft remembers to write it back; the
     * default would make the decoder consume the mark silently, and every save
     * would then drop it from the file.
     * @param bytes - the file's bytes.
     * @returns `{ text, bom }`, or `{ error }` when the bytes are not UTF-8.
     */
    function decode(bytes) {
      try {
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        const bom = text.charCodeAt(0) === 0xfeff;
        return { text: bom ? text.slice(1) : text, bom: bom };
      } catch (error) {
        return { error: error && error.message ? error.message : String(error) };
      }
    }

    /**
     * Read the owning session identity out of a file resource address.
     * @param address - `dsh-resource://file/session/<sessionId>/<path>`.
     * @returns the decoded session id, or undefined for any other address.
     */
    function sessionIdOf(address) {
      const match = /^dsh-resource:\/\/file\/session\/([^/]+)/.exec(typeof address === 'string' ? address : '');
      if (!match) return undefined;
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }

    /**
     * Read a session file address into the workspace call it stands for.
     * @param address - `dsh-resource://file/session/<sessionId>/<path>`.
     * @returns `{ sessionId, path }`, or undefined for any other address.
     */
    function fileOf(address) {
      const match = /^dsh-resource:\/\/file\/session\/([^/?#]+)\/([^?#]*)/.exec(typeof address === 'string' ? address : '');
      if (!match) return undefined;
      let sessionId = match[1];
      try {
        sessionId = decodeURIComponent(sessionId);
      } catch {
        // Keep the raw segment; the read will reject an unusable id.
      }
      const path = match[2]
        .split('/')
        .map((segment) => {
          try {
            return decodeURIComponent(segment);
          } catch {
            return segment;
          }
        })
        .join('/');
      return { sessionId: sessionId, path: path };
    }

    /** Re-render an open editor when the active locale changes. */
    function useLocaleRevision() {
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        if (!localeService || typeof localeService.subscribe !== 'function') return undefined;
        return localeService.subscribe(() => bump((value) => value + 1));
      }, []);
    }

    /* ── Markdown tokenizing ───────────────────────────────────────────── */

    /** Inline Markdown alternatives; the first matching alternative wins. */
    const INLINE_PATTERN =
      /(?<escape>\\[\\`*_{}\[\]()#+.!~>-])|(?<code>`+[^`\n]*?`+)|(?<strong>\*\*(?=[^\s*])[^*\n]*?[^\s*]\*\*|__(?=[^\s_])[^_\n]*?[^\s_]__)|(?<strike>~~(?=\S)[\s\S]*?\S~~)|(?<em>\*(?=[^\s*])[^*\n]*?[^\s*]\*|(?<![\w])_(?=[^\s_])[^_\n]*?[^\s_](?![\w])_)|(?<image>!\[[^\]\n]*\]\([^)\n]*\))|(?<link>\[[^\]\n]*\]\([^)\n]*\))|(?<autolink><(?:https?:\/\/|mailto:)[^>\s]*>)|(?<html><!--[\s\S]*?-->|<\/?[A-Za-z][^>\n]*>)/g;

    /** Split one link or image match into its bang, label, and target parts. */
    const LINK_PARTS = /^(!?)\[([^\]]*)\]\(([^)]*)\)$/;

    /** Head of one fenced code block. */
    const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})/;

    /** A thematic break line. */
    const RULE_PATTERN = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

    /** An ATX heading line, with its trailing text when present. */
    const HEADING_PATTERN = /^(#{1,6})(\s.*)?$/;

    /** A blockquote line, with its content. */
    const QUOTE_PATTERN = /^(\s*>+\s?)(.*)$/;

    /** A list item line, with its marker and content. */
    const LIST_PATTERN = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/;

    /** A table row line. */
    const TABLE_PATTERN = /^\s*\|.*\|\s*$/;

    /* ── List input assistance ─────────────────────────────────────────── */

    /** The opening of a list item: indentation, bullet or number, whitespace. */
    const LIST_PREFIX_PATTERN = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)/;

    /** A line that holds nothing but a list marker, i.e. an empty item. */
    const LIST_EMPTY_PATTERN = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]*$/;

    /**
     * Build the marker that continues a list item.
     * @param line - the line text before the caret.
     * @returns the prefix for the next item, or undefined when the line opens none.
     */
    function listPrefix(line) {
      if (RULE_PATTERN.test(line)) return undefined;
      const match = LIST_PREFIX_PATTERN.exec(line);
      if (match === null) return undefined;
      const marker = match[2];
      if (!/^\d/.test(marker)) return match[0];
      const digits = marker.slice(0, -1);
      const next = Number.parseInt(digits, 10) + 1;
      if (!Number.isSafeInteger(next)) return match[0];
      return match[1] + String(next).padStart(digits.length, '0') + marker.slice(-1) + match[3];
    }

    /**
     * Whether an open fenced code block contains the line at the given offset.
     * @param text - the whole draft.
     * @param offset - a caret offset in the draft.
     * @returns whether that line sits inside a fence.
     */
    function fencedAt(text, offset) {
      const target = text.lastIndexOf('\n', offset - 1) + 1;
      let fence = '';
      for (const line of text.slice(0, target).split('\n')) {
        const head = FENCE_PATTERN.exec(line);
        if (fence === '') {
          if (head !== null) fence = head[1];
        } else if (head !== null && head[1][0] === fence[0] && head[1].length >= fence.length) {
          fence = '';
        }
      }
      return fence !== '';
    }

    /**
     * Apply list input assistance to one Enter press: repeat an unordered
     * marker, advance an ordered one, and end the list on an empty item.
     * @param text - the whole draft.
     * @param start - selection start; continuation needs a collapsed caret.
     * @param end - selection end.
     * @returns the next draft and caret offset, or undefined to let Enter pass.
     */
    function continueList(text, start, end) {
      if (start !== end) return undefined;
      if (fencedAt(text, start)) return undefined;
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const prefix = listPrefix(text.slice(lineStart, start));
      if (prefix === undefined) return undefined;
      const lineEnd = text.indexOf('\n', start);
      const stop = lineEnd === -1 ? text.length : lineEnd;
      if (LIST_EMPTY_PATTERN.test(text.slice(lineStart, stop))) {
        // Enter on an empty item ends the list: drop the marker in place.
        return { text: text.slice(0, lineStart) + text.slice(stop), caret: lineStart };
      }
      const insert = '\n' + prefix;
      return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
    }

    /**
     * Tokenize one line's inline Markdown.
     * @param line - the line's text.
     * @param base - class applied to text no token claims.
     * @returns ordered `{ text, cls }` tokens.
     */
    function inlineTokens(line, base) {
      const tokens = [];
      if (line === '') return tokens;
      INLINE_PATTERN.lastIndex = 0;
      let last = 0;
      let match;
      while ((match = INLINE_PATTERN.exec(line)) !== null) {
        if (match.index > last) tokens.push({ text: line.slice(last, match.index), cls: base });
        const groups = match.groups || {};
        if (groups.escape !== undefined) {
          tokens.push({ text: match[0], cls: 'dsh-mdm-escape' });
        } else if (groups.code !== undefined) {
          tokens.push({ text: match[0], cls: 'dsh-mdm-code' });
        } else if (groups.strong !== undefined) {
          tokens.push({ text: match[0], cls: 'dsh-mdm-strong' });
        } else if (groups.strike !== undefined) {
          tokens.push({ text: match[0], cls: 'dsh-mdm-strike' });
        } else if (groups.em !== undefined) {
          tokens.push({ text: match[0], cls: 'dsh-mdm-em' });
        } else if (groups.image !== undefined || groups.link !== undefined) {
          const parts = LINK_PARTS.exec(match[0]);
          if (parts === null) {
            tokens.push({ text: match[0], cls: 'dsh-mdm-link' });
          } else {
            if (parts[1] === '!') tokens.push({ text: '!', cls: 'dsh-mdm-punct' });
            tokens.push({ text: '[', cls: 'dsh-mdm-punct' });
            tokens.push({ text: parts[2], cls: parts[1] === '!' ? 'dsh-mdm-image' : 'dsh-mdm-link' });
            tokens.push({ text: '](', cls: 'dsh-mdm-punct' });
            tokens.push({ text: parts[3], cls: 'dsh-mdm-url' });
            tokens.push({ text: ')', cls: 'dsh-mdm-punct' });
          }
        } else if (groups.autolink !== undefined) {
          tokens.push({ text: match[0], cls: 'dsh-mdm-link' });
        } else if (groups.html !== undefined) {
          tokens.push({ text: match[0], cls: 'dsh-mdm-comment' });
        } else {
          tokens.push({ text: match[0], cls: base });
        }
        last = match.index + match[0].length;
      }
      if (last < line.length) tokens.push({ text: line.slice(last), cls: base });
      return tokens.filter((token) => token.text !== '');
    }

    /**
     * Tokenize one line, using the block construct it sits in.
     * @param line - the line's text.
     * @param inFence - whether an open fenced code block contains this line.
     * @returns ordered `{ text, cls }` tokens.
     */
    function classifyLine(line, inFence) {
      const fence = FENCE_PATTERN.exec(line);
      if (inFence) {
        return fence === null ? [{ text: line, cls: 'dsh-mdm-code-line' }] : [{ text: line, cls: 'dsh-mdm-fence' }];
      }
      if (fence !== null) return [{ text: line, cls: 'dsh-mdm-fence' }];
      if (RULE_PATTERN.test(line)) return [{ text: line, cls: 'dsh-mdm-hr' }];
      if (/^\s*<!--/.test(line)) return [{ text: line, cls: 'dsh-mdm-comment' }];
      const heading = HEADING_PATTERN.exec(line);
      if (heading !== null) {
        const tokens = [{ text: heading[1], cls: 'dsh-mdm-marker' }];
        if (heading[2] !== undefined) tokens.push(...inlineTokens(heading[2], 'dsh-mdm-heading'));
        return tokens;
      }
      const quote = QUOTE_PATTERN.exec(line);
      if (quote !== null) {
        return [{ text: quote[1], cls: 'dsh-mdm-marker' }, ...inlineTokens(quote[2], 'dsh-mdm-quote')];
      }
      const list = LIST_PATTERN.exec(line);
      if (list !== null) return [{ text: list[1], cls: 'dsh-mdm-marker' }, ...inlineTokens(list[2], '')];
      if (TABLE_PATTERN.test(line)) return [{ text: line, cls: 'dsh-mdm-table' }];
      return inlineTokens(line, '');
    }

    /**
     * Tokenize a whole document, one token array per line.
     * @param text - the document text.
     * @returns one ordered token array per source line.
     */
    function highlightLines(text) {
      const lines = text.split('\n');
      const result = [];
      let fence = '';
      for (const line of lines) {
        const key = (fence === '' ? 't' : 'c') + '\u0000' + line;
        let tokens = lineCache.get(key);
        if (tokens === undefined) {
          tokens = classifyLine(line, fence !== '');
          if (lineCache.size >= LINE_CACHE_LIMIT) lineCache.clear();
          lineCache.set(key, tokens);
        }
        result.push(tokens);
        const head = FENCE_PATTERN.exec(line);
        if (fence !== '') {
          if (head !== null && head[1][0] === fence[0] && head[1].length >= fence.length) fence = '';
        } else if (head !== null) {
          fence = head[1];
        }
      }
      return result;
    }

    /* ── The editor body ───────────────────────────────────────────────── */

    /**
     * Return the caret to the editor once a save settles. A clicked Save or
     * overwrite button is disabled while saving, so the browser drops its
     * focus; without this the reader would have to click the textarea again to
     * keep typing. Focus is left alone when it already sits in the textarea or
     * has moved to a control outside this editor.
     * @param area - the editor textarea, when it is still mounted.
     */
    function refocusEditor(area) {
      if (!area) return;
      const doc = area.ownerDocument;
      const active = doc.activeElement;
      if (active === area) return;
      const root = area.closest('.dsh-markdown-editor');
      if (active !== null && active !== doc.body && (root === null || !root.contains(active))) return;
      const start = area.selectionStart;
      const end = area.selectionEnd;
      area.focus();
      if (area.selectionStart !== start || area.selectionEnd !== end) {
        area.selectionStart = start;
        area.selectionEnd = end;
      }
    }

    /**
     * The editor state for a file whose text is known and unmodified.
     * @param text - the decoded file text.
     * @param bom - whether the file carries a byte-order mark.
     * @returns a clean editor state.
     */
    function editorSeed(text, bom) {
      return {
        draft: text,
        saved: text,
        bom: bom === true,
        status: 'idle',
        error: undefined,
        changed: false,
        conflict: undefined,
        composing: false,
      };
    }

    /**
     * Fold one delivered document into the editor's basis. A delivery that
     * matches the text this editor last wrote is our own save coming back, not
     * another writer's change, so it never raises the changed notice.
     * @param prev - current editor state, or undefined before the first decode.
     * @param decoded - the decoded text and BOM flag from the Host bytes.
     * @param written - the text this editor last sent to the Host, when any.
     * @returns the next editor state.
     */
    function adoptDecoded(prev, decoded, written) {
      if (prev === undefined) return editorSeed(decoded.text, decoded.bom);
      if (decoded.text === prev.saved) {
        if (!prev.changed && prev.conflict === undefined) return prev;
        return { ...prev, changed: false, conflict: undefined };
      }
      if (prev.draft === prev.saved) return editorSeed(decoded.text, decoded.bom);
      if (written !== undefined && decoded.text === written) {
        if (prev.status === 'saving') return prev;
        return { ...prev, saved: decoded.text, bom: decoded.bom === true, changed: false, conflict: undefined };
      }
      return prev.changed ? prev : { ...prev, changed: true };
    }

    /**
     * One open Markdown file as a highlighted, editable textarea.
     * @param props - owner content plus the standard resource and tab hooks.
     * @returns the editor, or the reason it cannot show one.
     */
    function MarkdownEditorBody(props) {
      const wrap = props.wrap;
      const scrollportRef = props.scrollportRef;
      const resourceAddress = props.resourceAddress;
      const request = props.content !== undefined && props.content.kind === 'renderer' ? props.content : undefined;
      const revision = request !== undefined ? request.revision : undefined;
      const meta = props.useResource(resourceAddress);
      const absolutePath = meta && meta.value ? meta.value.absolutePath : undefined;
      const sessionId = props.sessionId !== undefined ? props.sessionId : sessionIdOf(resourceAddress);

      useLocaleRevision();

      const [loaded, setLoaded] = React.useState(undefined);
      const [loadError, setLoadError] = React.useState(undefined);

      /* Load the file's bytes ourselves. The preview bumps this revision whenever
         the file's version changes — including our own save — and the body stays
         mounted throughout, so focus and the caret survive a write. */
      React.useEffect(() => {
        if (request === undefined) return undefined;
        const controller = new AbortController();
        let live = true;
        readBytes(fileOf(resourceAddress), controller.signal).then(
          (result) => {
            if (!live) return;
            if (result && result.ok === true) {
              setLoaded({ data: result.value.data, version: result.value.version });
              setLoadError(undefined);
              request.loaded(result.value.version);
              return;
            }
            const error = result && result.error ? result.error : undefined;
            setLoadError(error && error.message ? error.message : translate('error.loadFailed'));
            request.failed();
          },
          (error) => {
            if (!live) return;
            setLoadError(error && error.message ? error.message : String(error));
            request.failed();
          },
        );
        return () => {
          live = false;
          controller.abort();
        };
      }, [revision, resourceAddress]);

      const bytes = loaded !== undefined ? loaded.data : undefined;
      const decodedRef = React.useRef(undefined);
      if (bytes !== undefined && (!decodedRef.current || decodedRef.current.bytes !== bytes)) {
        decodedRef.current = { bytes: bytes, decoded: decode(bytes) };
      }
      const decoded = decodedRef.current === undefined ? undefined : decodedRef.current.decoded;

      const [state, setState] = React.useState(undefined);
      if (state === undefined && decoded !== undefined && decoded.text !== undefined) {
        setState(editorSeed(decoded.text, decoded.bom));
      }

      const areaRef = React.useRef(undefined);
      const highlightRef = React.useRef(undefined);
      const writeRef = React.useRef(undefined);
      const bindArea = React.useCallback(
        (node) => {
          areaRef.current = node;
          if (typeof scrollportRef === 'function') scrollportRef(node);
          else if (scrollportRef !== undefined && scrollportRef !== null) scrollportRef.current = node;
        },
        [scrollportRef],
      );

      const draft = state === undefined ? undefined : state.draft;
      const highlighted = React.useMemo(
        () => (draft === undefined || draft.length > HIGHLIGHT_LIMIT ? undefined : highlightLines(draft)),
        [draft],
      );

      React.useEffect(() => {
        if (!decoded || decoded.text === undefined) return;
        setState((prev) => adoptDecoded(prev, decoded, writeRef.current));
      }, [decoded]);

      React.useLayoutEffect(() => {
        const area = areaRef.current;
        const highlight = highlightRef.current;
        if (!area || !highlight) return;
        highlight.scrollTop = area.scrollTop;
        highlight.scrollLeft = area.scrollLeft;
      });

      /**
       * Send the current draft to the Host.
       * @param force - write even though the draft's basis is stale.
       */
      function save(force) {
        const current = state;
        if (current.status === 'saving') return;
        if (!absolutePath) {
          setState((prev) => ({ ...prev, status: 'error', error: translate('error.noPath') }));
          return;
        }
        const sent = current.draft;
        writeRef.current = sent;
        const payload = { path: absolutePath, text: sent, bom: current.bom === true };
        if (sessionId !== undefined) payload.sessionId = sessionId;
        if (force === true) payload.force = true;
        else payload.baseText = current.saved;
        setState((prev) => ({ ...prev, status: 'saving', error: undefined, conflict: undefined }));
        fetch(SAVE_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(async (response) => {
            let answer;
            try {
              answer = await response.json();
            } catch {
              answer = undefined;
            }
            if (response.ok && answer && answer.ok === true) {
              setState((prev) => ({
                ...prev,
                saved: sent,
                status: prev.draft === sent ? 'saved' : 'idle',
                error: undefined,
                conflict: undefined,
                changed: prev.draft === sent ? false : prev.changed,
              }));
              return;
            }
            if (response.status === 409) {
              setState((prev) => ({
                ...prev,
                status: 'idle',
                error: undefined,
                conflict: {
                  message: (answer && answer.message) || translate('notice.conflict'),
                  current: answer && typeof answer.current === 'string' ? answer.current : undefined,
                  bom: answer ? answer.bom === true : false,
                },
              }));
              return;
            }
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: (answer && answer.message) || translate('error.saveFailed'),
            }));
          })
          .catch((error) => {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: error && error.message ? error.message : String(error),
            }));
          })
          .finally(() => refocusEditor(areaRef.current));
      }

      /**
       * The newest text the document delivered for this file, when it has moved
       * past the saved basis; otherwise the saved basis itself.
       * @returns the disk text and whether it carries a byte-order mark.
       */
      function diskText() {
        if (decoded && decoded.text !== undefined && decoded.text !== state.saved) {
          return { text: decoded.text, bom: decoded.bom === true };
        }
        return { text: state.saved, bom: state.bom };
      }

      /** Restore the draft to the text currently on disk. */
      function discard() {
        const disk = diskText();
        setState((prev) => ({ ...prev, draft: disk.text, saved: disk.text, bom: disk.bom, status: 'idle', error: undefined, changed: false, conflict: undefined }));
      }

      /** Adopt the newest content the document delivered. */
      function adopt() {
        if (!decoded || decoded.text === undefined) return;
        setState((prev) => ({
          ...prev,
          draft: decoded.text,
          saved: decoded.text,
          bom: decoded.bom === true,
          status: 'idle',
          error: undefined,
          changed: false,
          conflict: undefined,
        }));
      }

      /** Adopt the disk text a refused save reported, or the newest delivered content. */
      function loadDisk() {
        const conflict = state.conflict;
        const newest = diskText();
        const hasNewest = newest.text !== state.saved;
        const text = hasNewest || !conflict || typeof conflict.current !== 'string' ? newest.text : conflict.current;
        const bom = hasNewest || !conflict ? newest.bom : conflict.bom === true;
        setState((prev) => ({
          ...prev,
          draft: text,
          saved: text,
          bom: bom,
          status: 'idle',
          error: undefined,
          changed: false,
          conflict: undefined,
        }));
      }

      /** @param event - textarea change. */
      function onChange(event) {
        const value = event.target.value;
        setState((prev) => ({ ...prev, draft: value }));
      }

      /** @param event - textarea keydown; Ctrl/⌘+S saves, Enter continues a list, and Tab indents. */
      function onKeyDown(event) {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.key === 's' || event.key === 'S')) {
          event.preventDefault();
          if (state.draft !== state.saved) save(false);
          return;
        }
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !state.composing &&
          event.isComposing !== true &&
          event.keyCode !== 229
        ) {
          const element = event.currentTarget;
          const edit = continueList(state.draft, element.selectionStart, element.selectionEnd);
          if (edit !== undefined) {
            event.preventDefault();
            setState((prev) => ({ ...prev, draft: edit.text }));
            requestAnimationFrame(() => {
              element.selectionStart = edit.caret;
              element.selectionEnd = edit.caret;
            });
          }
          return;
        }
        if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          const element = event.currentTarget;
          const start = element.selectionStart;
          const end = element.selectionEnd;
          const next = state.draft.slice(0, start) + '  ' + state.draft.slice(end);
          setState((prev) => ({ ...prev, draft: next }));
          requestAnimationFrame(() => {
            element.selectionStart = start + 2;
            element.selectionEnd = start + 2;
          });
        }
      }

      /** @param event - textarea scroll; the backdrop follows it. */
      function onScroll(event) {
        const highlight = highlightRef.current;
        if (!highlight) return;
        highlight.scrollTop = event.currentTarget.scrollTop;
        highlight.scrollLeft = event.currentTarget.scrollLeft;
      }

      /** Keep an IME composition legible: the textarea owns the text while it composes. */
      function onCompositionStart() {
        setState((prev) => (prev.composing ? prev : { ...prev, composing: true }));
      }

      /** @param event - composition end, carrying the committed textarea value. */
      function onCompositionEnd(event) {
        const value = event.target.value;
        setState((prev) => ({ ...prev, composing: false, draft: value }));
      }

      if (decoded !== undefined && decoded.text === undefined) {
        return h(
          'div',
          { className: 'dsh-markdown-editor' },
          h('style', { key: 'style' }, CSS),
          h('p', { className: 'dsh-markdown-editor-note', key: 'note' }, translate('error.decode')),
        );
      }

      if (state === undefined || decoded === undefined) {
        const failed = loadError !== undefined;
        return h(
          'div',
          { className: 'dsh-markdown-editor' },
          h('style', { key: 'style' }, CSS),
          h(
            'p',
            { className: failed ? 'dsh-markdown-editor-error' : 'dsh-markdown-editor-note', key: 'note' },
            failed ? loadError : translate('waiting'),
          ),
        );
      }

      const dirty = state.draft !== state.saved;
      const saving = state.status === 'saving';
      const label = saving
        ? translate('status.saving')
        : state.status === 'error'
          ? translate('status.failed')
          : dirty
            ? translate('status.unsaved')
            : translate('status.saved');

      const bar = h(
        'div',
        { className: 'dsh-markdown-editor-bar', key: 'bar' },
        h('span', {
          className: 'dsh-markdown-editor-dot',
          key: 'dot',
          'data-dirty': dirty ? 'true' : 'false',
          'data-busy': saving ? 'true' : 'false',
          'aria-hidden': 'true',
        }),
        h('span', { key: 'label', 'data-editor-status': 'true' }, label),
        h('span', { className: 'dsh-markdown-editor-spacer', key: 'spacer' }),
        h('span', { className: 'dsh-markdown-editor-hint', key: 'hint' }, translate('hint.shortcut')),
        h(
          'button',
          {
            key: 'discard',
            type: 'button',
            className: 'dsh-markdown-editor-button',
            disabled: !dirty || saving,
            onClick: discard,
          },
          translate('action.discard'),
        ),
        h(
          'button',
          {
            key: 'save',
            type: 'button',
            className: 'dsh-markdown-editor-button',
            'data-primary': 'true',
            disabled: !dirty || saving,
            onClick: () => save(false),
          },
          translate('action.save'),
        ),
      );

      const notice = state.conflict
        ? h(
            'div',
            { className: 'dsh-markdown-editor-notice', key: 'conflict' },
            h('span', { key: 'message' }, state.conflict.message || translate('notice.conflict')),
            h(
              'button',
              { key: 'disk', type: 'button', className: 'dsh-markdown-editor-button', onClick: loadDisk },
              translate('action.loadDisk'),
            ),
            h(
              'button',
              {
                key: 'overwrite',
                type: 'button',
                className: 'dsh-markdown-editor-button',
                'data-primary': 'true',
                onClick: () => save(true),
              },
              translate('action.overwrite'),
            ),
          )
        : state.changed
          ? h(
              'div',
              { className: 'dsh-markdown-editor-notice', key: 'changed' },
              h('span', { key: 'message' }, translate('notice.changed')),
              h(
                'button',
                { key: 'adopt', type: 'button', className: 'dsh-markdown-editor-button', onClick: adopt },
                translate('action.adopt'),
              ),
              h(
                'button',
                {
                  key: 'keep',
                  type: 'button',
                  className: 'dsh-markdown-editor-button',
                  onClick: () => setState((prev) => ({ ...prev, changed: false })),
                },
                translate('action.keep'),
              ),
            )
          : null;

      const error = state.error
        ? h('p', { className: 'dsh-markdown-editor-error', key: 'error' }, state.error)
        : null;

      const backdrop =
        highlighted === undefined
          ? state.draft + '\n'
          : highlighted.map((tokens, index) =>
              h(
                React.Fragment,
                { key: index },
                tokens.map((token, tokenIndex) => h('span', { key: tokenIndex, className: token.cls }, token.text)),
                '\n',
              ),
            );

      const surface = h(
        'div',
        { className: 'dsh-markdown-editor-surface', key: 'surface' },
        h(
          'pre',
          { className: 'dsh-markdown-editor-highlight', key: 'highlight', ref: highlightRef, 'aria-hidden': 'true' },
          h('code', null, backdrop),
        ),
        h('textarea', {
          key: 'input',
          className: 'dsh-markdown-editor-input',
          ref: bindArea,
          value: state.draft,
          wrap: wrap === false ? 'off' : 'soft',
          spellCheck: false,
          autoCapitalize: 'off',
          autoCorrect: 'off',
          'aria-label': translate('viewer.editor'),
          onChange: onChange,
          onKeyDown: onKeyDown,
          onScroll: onScroll,
          onCompositionStart: onCompositionStart,
          onCompositionEnd: onCompositionEnd,
        }),
      );

      return h(
        'div',
        {
          className: 'dsh-markdown-editor',
          'data-wrap': wrap === false ? 'false' : 'true',
          'data-composing': state.composing ? 'true' : 'false',
        },
        h('style', { key: 'style' }, CSS),
        bar,
        notice,
        error,
        surface,
      );
    }

    return {
      inject: ['slots', 'locale', 'documentPreviews'],
      apply(ctx) {
        localeService = ctx.locale;
        translate = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), 'markdown-editor: locale');
        // Own the byte read: a `renderer` implementation loads its own content,
        // so the preview never drops the body while re-reading after a save.
        ctx.inject(['remote', 'remote.workspaceFiles'], (scope) => {
          readBytes = (file, signal) =>
            file === undefined
              ? Promise.resolve({
                  ok: false,
                  error: { code: 'workspace-file/unsupported-address', message: translate('error.loadFailed') },
                })
              : scope.remote.workspaceFiles.readBytes(file.sessionId, file.path, {}, signal);
        });
        ctx.effect(
          () =>
            ctx.documentPreviews.register({
              id: EDITOR_ID,
              extensions: EXTENSIONS,
              priority: 'extension',
              title: () => translate('viewer.editor'),
              loading: 'renderer',
              wrap: true,
            }),
          'markdown-editor: document implementation',
        );
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.right.tab.document', () =>
              ctx.slots.register({ name: 'sidebar.right.tab.document', key: EDITOR_ID }, MarkdownEditorBody),
            ),
          'markdown-editor: document body',
        );
      },
    };
  },
});
