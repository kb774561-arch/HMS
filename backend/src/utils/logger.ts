type LogMeta = Record<string, unknown>;

function sanitize(meta?: LogMeta): LogMeta | undefined {
  if (!meta) return undefined;
  const clone = { ...meta };
  for (const key of Object.keys(clone)) {
    if (/password|secret|token|database_url|direct_url/i.test(key)) {
      clone[key] = "[REDACTED]";
    }
  }
  return clone;
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    console.log(JSON.stringify({ level: "info", message, ...sanitize(meta), ts: new Date().toISOString() }));
  },
  warn(message: string, meta?: LogMeta) {
    console.warn(JSON.stringify({ level: "warn", message, ...sanitize(meta), ts: new Date().toISOString() }));
  },
  error(message: string, meta?: LogMeta) {
    console.error(JSON.stringify({ level: "error", message, ...sanitize(meta), ts: new Date().toISOString() }));
  },
};
