const resolveBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL?.toString().trim();
  if (envUrl) return envUrl;

  if (typeof window !== 'undefined' && window.location?.hostname === 'app.local') {
    return 'http://localhost:5000/api';
  }

  return '/api';
};

const API_BASE_URL = resolveBaseUrl();

const getToken = () => localStorage.getItem('authToken');

const buildHeaders = (extra?: Record<string, string>) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

export const apiClient = {
  baseUrl: API_BASE_URL,
  async get<T>(path: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout for speed

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: buildHeaders(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },
  async post<T>(path: string, body?: unknown) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  },
  async patch<T>(path: string, body?: unknown) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  },
  async delete(path: string) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: buildHeaders()
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }
  },
  async upload<T>(path: string, file: File) {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json() as Promise<T>;
  }
};
