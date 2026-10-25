const API_URL = import.meta.env.VITE_API_URL ?? "/api";

const TOKEN_KEY = "ggp_token";
const EXPIRES_KEY = "ggp_token_expires";
const USER_KEY = "ggp_user";

/** 401 codes that mean the session cannot be used any more. Anything else is not a logout. */
const SESSION_ENDED = new Set(["TOKEN_MISSING", "TOKEN_INVALID", "TOKEN_EXPIRED", "SESSION_REVOKED", "ACCOUNT_INACTIVE"]);

export const SESSION_EXPIRED_EVENT = "ggp:session-expired";

export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: Record<string, string>;

  constructor(message: string, status: number, code?: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  get isValidation() {
    return this.status === 400 || this.status === 422;
  }
}

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY),
  save(token: string, expiresAt?: string) {
    localStorage.setItem(TOKEN_KEY, token);
    if (expiresAt) localStorage.setItem(EXPIRES_KEY, expiresAt);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    localStorage.removeItem(USER_KEY);
  },
  cachedUser<T>(): T | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  cacheUser(user: unknown) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
};

let refreshing: Promise<void> | null = null;

/** Sliding session: when under an hour remains, swap for a fresh token before the call. */
async function refreshIfNeeded(path: string) {
  if (path.startsWith("/auth/")) return;
  const token = session.token();
  const expires = localStorage.getItem(EXPIRES_KEY);
  if (!token || !expires) return;
  const remaining = new Date(expires).getTime() - Date.now();
  if (remaining <= 0 || remaining > 60 * 60 * 1000) return;

  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
    .then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as { data: { token: string; expiresAt: string; user: unknown } };
      session.save(body.data.token, body.data.expiresAt);
      session.cacheUser(body.data.user);
    })
    .catch(() => undefined)
    .finally(() => {
      refreshing = null;
    });
  await refreshing;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  await refreshIfNeeded(path);

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = session.token();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection and try again.", 0, "NETWORK");
  }

  const body = (await res.json().catch(() => ({}))) as {
    data?: T;
    message?: string;
    code?: string;
    details?: { fieldErrors?: Record<string, string> };
  };

  if (!res.ok) {
    if (res.status === 401 && body.code && SESSION_ENDED.has(body.code)) {
      session.clear();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message: body.message } }));
    }
    throw new ApiError(
      body.message ?? `Request failed (${res.status})`,
      res.status,
      body.code,
      body.details?.fieldErrors,
    );
  }

  return body.data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const http = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, json("POST", body ?? {})),
  patch: <T>(path: string, body: unknown) => apiFetch<T>(path, json("PATCH", body)),
  put: <T>(path: string, body: unknown) => apiFetch<T>(path, json("PUT", body)),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

export function qs(params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
