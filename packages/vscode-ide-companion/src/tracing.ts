/**
 * Lightweight tracing helper for the VSCode extension.
 *
 * - If an OutputChannel is registered via `setOutputChannel`, messages are
 *   written there. Otherwise falls back to console.
 */

type OutputLike = { appendLine(message: string): void; show?(preserveFocus?: boolean): void };

let channel: OutputLike | null = null;

function formatArgs(args: any[]) {
  try {
    return args
      .map((a) => {
        if (a instanceof Error) {
          return a.stack ?? a.message;
        }
        if (typeof a === 'object') {
          try {
            return JSON.stringify(a);
          } catch (e) {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');
  } catch (e) {
    return args.map(String).join(' ');
  }
}

export function setOutputChannel(c: OutputLike | null) {
  channel = c;
}

export function info(...args: any[]) {
  const msg = formatArgs(args);
  if (channel) {
    channel.appendLine(`[info] ${msg}`);
  } else {
    console.log(msg);
  }
}

export function debug(...args: any[]) {
  const msg = formatArgs(args);
  if (channel) {
    channel.appendLine(`[debug] ${msg}`);
  } else {
    console.debug(msg);
  }
}

export function warn(...args: any[]) {
  const msg = formatArgs(args);
  if (channel) {
    channel.appendLine(`[warn] ${msg}`);
  } else {
    console.warn(msg);
  }
}

export function error(...args: any[]) {
  const msg = formatArgs(args);
  if (channel) {
    channel.appendLine(`[error] ${msg}`);
  } else {
    console.error(msg);
  }
}

export default { setOutputChannel, info, debug, warn, error };
