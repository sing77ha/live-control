export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /pass|secret|token|authorization|cookie|key|credential|dsn|url|signature/i;
export const REDACTED = '[redacted]';

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  service: string;
  level: LogLevel;
  bindings?: LogFields;
  /** Output sink. Defaults to stdout (debug/info) and stderr (warn/error). */
  write?: (line: string, level: LogLevel) => void;
  now?: () => Date;
}

function serializeError(error: Error): LogFields {
  return { name: error.name, message: error.message, stack: error.stack };
}

/** Redacts values whose key looks sensitive and serializes errors. Depth-limited. */
export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return serializeError(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1);
  }
  return output;
}

const defaultWrite = (line: string, level: LogLevel): void => {
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
};

export function createLogger(options: LoggerOptions): Logger {
  const write = options.write ?? defaultWrite;
  const now = options.now ?? (() => new Date());
  const bindings = options.bindings ?? {};

  const log = (level: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[options.level]) return;
    const record = {
      ...(redact(bindings) as LogFields),
      ...(fields ? (redact(fields) as LogFields) : {}),
      time: now().toISOString(),
      level,
      service: options.service,
      msg: message,
    };
    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      line = JSON.stringify({ time: record.time, level, service: options.service, msg: message });
    }
    write(line, level);
  };

  return {
    debug: (message, fields) => log('debug', message, fields),
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
    child: (extra) => createLogger({ ...options, bindings: { ...bindings, ...extra } }),
  };
}
