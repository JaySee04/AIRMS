const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

/**
 * An HTTP failure, carrying the status.
 *
 * The status matters to callers that must tell one failure from another — a
 * session check has to distinguish "the server rejected this token" (sign out)
 * from "the network is down" (keep the session and try later). A bare Error
 * with a message collapses those two into the same thing.
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** True when the server refused the caller's identity, not merely the request. */
export const isAuthError = (e: unknown): boolean =>
  e instanceof ApiError && (e.status === 401 || e.status === 403);

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('airms_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? `HTTP ${res.status}`);
  return data as T;
}

// Multipart upload (e.g. the HoloMotion PDF preview). Like request(), but the
// body is a FormData — so Content-Type is deliberately left unset, letting the
// browser add the multipart boundary. Same auth + error handling as request().
async function upload<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? `HTTP ${res.status}`);
  return data as T;
}

// Used for binary downloads (e.g. PDF reports). Returns the raw Response so
// the caller can read Content-Disposition and stream the blob.
async function downloadPost(path: string, body: unknown): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message ?? `HTTP ${res.status}`);
  }
  return res;
}

// GET binary download (PDF reports). Fetches with auth and triggers a browser
// save. Throws with the server message on failure.
async function downloadGet(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message ?? `HTTP ${res.status}`);
  }
  // Prefer the server-set filename (Content-Disposition) — the backend owns the
  // report-naming scheme. Fall back to the caller's name if the header is absent.
  const cd = res.headers.get('Content-Disposition');
  const match = cd && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = match ? decodeURIComponent(match[1].trim()) : filename;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload,
  downloadPost,
  downloadGet,
};
