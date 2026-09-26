/**
 * Host half of the Markdown editor bundle.
 *
 * One authenticated POST route on the shared `/api` channel saves an opened
 * Markdown file. The write goes through the composed filesystem (`ctx.fs`), so
 * it inherits the deployment's sandbox policy, the backend's atomic
 * publication, and its version guard. The route carries no authority of its
 * own: it is reachable only through the browser session the Connection
 * carrier already admitted (cookie + loopback host/Origin trust).
 */

import { isAbsolute } from 'node:path';

/** Exact path below the shared `/api` channel that accepts one save request. */
const SAVE_PATH = '/api/dsh-markdown-editor/save';

/** Suffixes this route is willing to write; the editor only claims these. */
const MARKDOWN_SUFFIX = /\.(?:md|markdown|mdx|mdown|mkd)$/i;

/** Refuse an edit larger than this before it reaches the filesystem. */
const MAX_TEXT_BYTES = 16 * 1024 * 1024;

/** Required Host services: the admitted HTTP channel and the filesystem seam. */
export const inject = ['connection', 'fs'];

/**
 * Register the save route for this plugin's lifetime.
 * @param ctx - Host context carrying `connection` and `fs`.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: SAVE_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handleSave(ctx, request),
      }),
    'markdown-editor: save route',
  );
}

/**
 * Answer one save request as JSON.
 * @param status - HTTP status of the answer.
 * @param payload - JSON-serializable body.
 * @returns the response the Connection carrier writes.
 */
function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * Build one refused answer.
 * @param status - HTTP status of the refusal.
 * @param code - stable machine-readable reason.
 * @param message - human-readable reason shown in the editor.
 * @param extra - optional extra JSON fields merged into the body.
 * @returns the refusal response.
 */
function failure(status, code, message, extra) {
  return json(status, { ok: false, code, message, ...(extra ?? {}) });
}

/** @param text - a string that may start with a byte-order mark. @returns whether it does. */
function hasBom(text) {
  return text.charCodeAt(0) === 0xfeff;
}

/** @param text - a string that may start with a byte-order mark. @returns it without one. */
function stripBom(text) {
  return hasBom(text) ? text.slice(1) : text;
}

/**
 * Map one filesystem failure onto the editor's status vocabulary.
 * @param error - the thrown value from `ctx.fs`.
 * @returns the refused response.
 */
function fsFailure(error) {
  const code = error && typeof error.code === 'string' ? error.code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  switch (code) {
    case 'FS_STALE_VERSION':
    case 'FS_NOT_OBSERVED':
      return failure(409, 'conflict', message);
    case 'FS_SANDBOX_DENIED':
      return failure(403, 'sandbox-denied', message);
    case 'FS_PERMISSION_DENIED':
      return failure(403, 'permission-denied', message);
    case 'FS_NOT_FOUND':
      return failure(404, 'not-found', message);
    case 'FS_NOT_TEXT':
      return failure(415, 'not-text', message);
    case 'FS_TOO_LARGE':
      return failure(413, 'too-large', message);
    case 'FS_ABORTED':
      return failure(499, 'aborted', message);
    default:
      return failure(500, 'io-error', message);
  }
}

/**
 * Resolve the sandbox policy of the session that owns the tab, so the write is
 * fenced against the same workspace root and mode as that session's tools. A
 * session that is not loaded in memory falls back to the deployment default.
 * @param ctx - Host context.
 * @param sessionId - owning session identity sent by the client, when known.
 * @returns the policy for this write, or undefined without a policy service.
 */
function policyFor(ctx, sessionId) {
  const sandboxPolicy = ctx.get('sandboxPolicy');
  if (!sandboxPolicy) return undefined;
  let session;
  if (typeof sessionId === 'string' && sessionId !== '') {
    const sessions = ctx.get('sessions');
    session = sessions ? sessions.get(sessionId) : undefined;
  }
  try {
    return session ? sandboxPolicy.resolve({ session }) : sandboxPolicy.resolve();
  } catch {
    return undefined;
  }
}

/**
 * Handle one save request: validate the envelope, guard against a concurrent
 * change, and replace the file atomically.
 * @param ctx - Host context carrying `fs`.
 * @param request - the admitted WHATWG request.
 * @returns the JSON answer.
 */
async function handleSave(ctx, request) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, code: 'method-not-allowed', message: 'POST is required' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return failure(400, 'bad-request', 'a JSON body is required');
  }
  if (body === null || typeof body !== 'object') {
    return failure(400, 'bad-request', 'a JSON object is required');
  }

  const path = body.path;
  const text = body.text;
  const baseText = body.baseText;
  const force = body.force === true;

  if (typeof path !== 'string' || path === '') {
    return failure(400, 'bad-request', 'path is required');
  }
  if (!isAbsolute(path)) {
    return failure(400, 'bad-request', 'path must be absolute');
  }
  if (!MARKDOWN_SUFFIX.test(path)) {
    return failure(400, 'unsupported-file', 'only Markdown files can be saved here');
  }
  if (typeof text !== 'string') {
    return failure(400, 'bad-request', 'text is required');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
    return failure(413, 'too-large', 'the edited text is too large to save');
  }
  if (!force && typeof baseText !== 'string') {
    return failure(400, 'bad-request', 'baseText is required unless force is true');
  }

  const policy = policyFor(ctx, body.sessionId);
  const resolveOptions = policy && policy.workspaceRoot ? { cwd: policy.workspaceRoot } : undefined;

  let target;
  try {
    target = await ctx.fs.resolve(path, resolveOptions);
  } catch (error) {
    return fsFailure(error);
  }

  let info;
  try {
    info = await ctx.fs.stat(target);
  } catch (error) {
    return fsFailure(error);
  }
  if (!info) {
    return failure(404, 'not-found', `no file exists at ${path}`);
  }
  if (info.type !== 'file') {
    return failure(400, 'not-regular-file', `${path} is not a regular file`);
  }

  if (!force) {
    let current;
    try {
      current = await ctx.fs.readText(target);
    } catch (error) {
      return fsFailure(error);
    }
    if (stripBom(current) !== stripBom(baseText)) {
      return failure(409, 'conflict', 'the file changed on disk since it was loaded', {
        current: stripBom(current),
        bom: hasBom(current),
      });
    }
  }

  const guard = { kind: 'replaceIfVersion', version: info.version };
  const content = (body.bom === true ? '\uFEFF' : '') + text;
  try {
    const outcome = await ctx.fs.writeText(target, content, guard, request.signal, policy);
    return json(200, {
      ok: true,
      path: target.displayPath,
      operation: outcome.operation,
      version: String(outcome.version),
    });
  } catch (error) {
    return fsFailure(error);
  }
}
