/**
 * Client half of the Markdown editor bundle.
 *
 * Registers a document implementation for Markdown suffixes that loads the
 * complete file and edits it in a plain textarea. Saving posts the text to the
 * Host half's route; the builtin Markdown preview stays selectable from the
 * document's own viewer dropdown.
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
      '.dsh-markdown-editor-input{box-sizing:border-box;flex:1 1 auto;min-height:12rem;margin:0;padding:10px 12px;border:0;outline:none;resize:none;background:transparent;color:var(--dsw-alias-label-primary);caret-color:var(--dsw-alias-brand-primary);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.6;tab-size:2;white-space:pre;overflow:auto;}',
      '.dsh-markdown-editor-input[data-wrap="true"]{white-space:pre-wrap;word-break:break-word;}',
    ].join('');

    /** Bound translate of the active locale; replaced when the plugin applies. */
    let translate = (key) => key;
    /** Locale service, so an open editor re-renders on a locale switch. */
    let localeService;

    /**
     * Decode complete file bytes as UTF-8.
     * @param bytes - the file's bytes.
     * @returns `{ text, bom }`, or `{ error }` when the bytes are not UTF-8.
     */
    function decode(bytes) {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
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

    /** Re-render an open editor when the active locale changes. */
    function useLocaleRevision() {
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        if (!localeService || typeof localeService.subscribe !== 'function') return undefined;
        return localeService.subscribe(() => bump((value) => value + 1));
      }, []);
    }

    /**
     * One open Markdown file as an editable textarea.
     * @param props - owner content plus the standard resource and tab hooks.
     * @returns the editor, or the reason it cannot show one.
     */
    function MarkdownEditorBody(props) {
      const content = props.content;
      const wrap = props.wrap;
      const scrollportRef = props.scrollportRef;
      const resourceAddress = props.resourceAddress;
      const meta = props.useResource(resourceAddress);
      const absolutePath = meta && meta.value ? meta.value.absolutePath : undefined;
      const sessionId = props.sessionId !== undefined ? props.sessionId : sessionIdOf(resourceAddress);

      useLocaleRevision();

      const bytes = content && content.kind === 'bytes' ? content.data : undefined;
      const decodedRef = React.useRef(undefined);
      if (!decodedRef.current || decodedRef.current.bytes !== bytes) {
        decodedRef.current = {
          bytes: bytes,
          decoded: bytes === undefined ? undefined : decode(bytes),
        };
      }
      const decoded = decodedRef.current.decoded;
      const initial = decoded && decoded.text !== undefined ? decoded.text : '';

      const [state, setState] = React.useState(() => ({
        draft: initial,
        saved: initial,
        bom: decoded ? decoded.bom === true : false,
        status: 'idle',
        error: undefined,
        changed: false,
        conflict: undefined,
      }));

      React.useEffect(() => {
        if (!decoded || decoded.text === undefined) return;
        setState((prev) => {
          if (decoded.text === prev.saved) {
            if (!prev.changed && prev.conflict === undefined) return prev;
            return { ...prev, changed: false, conflict: undefined };
          }
          if (prev.draft === prev.saved) {
            return {
              ...prev,
              draft: decoded.text,
              saved: decoded.text,
              bom: decoded.bom === true,
              status: 'idle',
              error: undefined,
              changed: false,
              conflict: undefined,
            };
          }
          return prev.changed ? prev : { ...prev, changed: true };
        });
      }, [decoded]);

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
          });
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

      /** @param event - textarea keydown; Ctrl/⌘+S saves and Tab indents. */
      function onKeyDown(event) {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.key === 's' || event.key === 'S')) {
          event.preventDefault();
          if (state.draft !== state.saved) save(false);
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

      if (!decoded) {
        return h(
          'div',
          { className: 'dsh-markdown-editor' },
          h('style', { key: 'style' }, CSS),
          h('p', { className: 'dsh-markdown-editor-note', key: 'note' }, translate('waiting')),
        );
      }

      if (decoded.text === undefined) {
        return h(
          'div',
          { className: 'dsh-markdown-editor' },
          h('style', { key: 'style' }, CSS),
          h('p', { className: 'dsh-markdown-editor-note', key: 'note' }, translate('error.decode')),
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

      const input = h('textarea', {
        key: 'input',
        className: 'dsh-markdown-editor-input',
        ref: scrollportRef,
        value: state.draft,
        wrap: wrap === false ? 'off' : 'soft',
        'data-wrap': wrap === false ? 'false' : 'true',
        spellCheck: false,
        autoCapitalize: 'off',
        autoCorrect: 'off',
        'aria-label': translate('viewer.editor'),
        onChange: onChange,
        onKeyDown: onKeyDown,
      });

      return h('div', { className: 'dsh-markdown-editor' }, h('style', { key: 'style' }, CSS), bar, notice, error, input);
    }

    return {
      inject: ['slots', 'locale', 'documentPreviews'],
      apply(ctx) {
        localeService = ctx.locale;
        translate = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), 'markdown-editor: locale');
        ctx.effect(
          () =>
            ctx.documentPreviews.register({
              id: EDITOR_ID,
              extensions: EXTENSIONS,
              priority: 'extension',
              title: () => translate('viewer.editor'),
              loading: 'bytes-complete',
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
