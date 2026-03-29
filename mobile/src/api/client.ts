import { BASE_URL, getToken, tryRefresh } from './tokenManager';

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const token = await getToken();
  const url = `${BASE_URL}${path}`;

  console.log(`[API] ${options.method ?? 'GET'} ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    clearTimeout(timeout);

    const text = await response.text();
    console.log(`[API] ${response.status} ${url} →`, text.slice(0, 200));

    if (response.status === 401 && !isRetry) {
      const refreshed = await tryRefresh();
      if (refreshed) return request<T>(path, options, true);
      throw new Error('Sessie verlopen. Log opnieuw in.');
    }

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { message = JSON.parse(text).error ?? message; } catch {}
      throw new Error(message);
    }

    return JSON.parse(text);
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`Geen verbinding met server (${BASE_URL}).`);
    }
    if (!err.message?.includes('HTTP 404')) {
      console.error(`[API] Fout bij ${url}:`, err.message);
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
