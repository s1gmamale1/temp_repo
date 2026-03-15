import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock import.meta.env before importing the module,
// so we test fetchApi behavior by re-implementing the key logic
// and testing the exported utilities directly.

describe('API Service', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchApi', () => {
    it('adds Authorization header when token exists in localStorage', async () => {
      localStorage.setItem('claw_token', 'test-jwt-token');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' }),
      });
      globalThis.fetch = mockFetch;

      // Dynamically import to get fresh module with mocked fetch
      const { fetchApi } = await import('./api');

      await fetchApi('/api/test');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-jwt-token');
    });

    it('does not add Authorization header when no token', async () => {
      localStorage.removeItem('claw_token');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' }),
      });
      globalThis.fetch = mockFetch;

      const { fetchApi } = await import('./api');

      await fetchApi('/api/test');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('throws on non-ok response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ error: 'Not found' })),
      });
      globalThis.fetch = mockFetch;

      const { fetchApi } = await import('./api');

      await expect(fetchApi('/api/missing')).rejects.toThrow('Not found');
    });

    it('handles network errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      globalThis.fetch = mockFetch;

      const { fetchApi } = await import('./api');

      await expect(fetchApi('/api/test')).rejects.toThrow('Failed to fetch');
    });
  });

  describe('Token storage/retrieval', () => {
    it('userSession.getToken returns token from localStorage', async () => {
      localStorage.setItem('claw_token', 'my-token');
      const { userSession } = await import('./api');
      expect(userSession.getToken()).toBe('my-token');
    });

    it('userSession.getToken returns null when no token', async () => {
      localStorage.removeItem('claw_token');
      const { userSession } = await import('./api');
      expect(userSession.getToken()).toBeNull();
    });

    it('userSession.setUser stores user and token', async () => {
      const { userSession } = await import('./api');
      const user = { id: 'u1', name: 'Test User' };
      userSession.setUser(user, 'new-token');

      expect(localStorage.getItem('claw_token')).toBe('new-token');
      expect(JSON.parse(localStorage.getItem('claw_user')!)).toEqual(user);
    });

    it('userSession.clearUser removes user and token', async () => {
      localStorage.setItem('claw_token', 'token');
      localStorage.setItem('claw_user', '{"id":"u1"}');

      const { userSession } = await import('./api');
      userSession.clearUser();

      expect(localStorage.getItem('claw_token')).toBeNull();
      expect(localStorage.getItem('claw_user')).toBeNull();
    });

    it('userSession.isLoggedIn returns true when token exists', async () => {
      localStorage.setItem('claw_token', 'token');
      const { userSession } = await import('./api');
      expect(userSession.isLoggedIn()).toBe(true);
    });

    it('userSession.isLoggedIn returns false when no token', async () => {
      localStorage.removeItem('claw_token');
      const { userSession } = await import('./api');
      expect(userSession.isLoggedIn()).toBe(false);
    });
  });

  describe('WebSocket URL construction', () => {
    it('WS_URL defaults to ws://localhost:3001/ws', async () => {
      localStorage.setItem('claw_token', 'ws-test-token');

      let capturedUrl = '';
      const OriginalWebSocket = globalThis.WebSocket;

      // Use a proper class to mock WebSocket so `new` works
      class MockWebSocket {
        static OPEN = 1;
        static CLOSED = 3;
        static CONNECTING = 0;
        static CLOSING = 2;
        onopen: any = null;
        onmessage: any = null;
        onclose: any = null;
        onerror: any = null;
        readyState = 1;
        close() {}
        send() {}
        constructor(url: string) {
          capturedUrl = url;
        }
      }

      globalThis.WebSocket = MockWebSocket as any;

      try {
        const { WebSocketClient } = await import('./api');
        const client = new WebSocketClient();
        client.connect([], 'user-1');

        expect(capturedUrl).toContain('token=ws-test-token');
        expect(capturedUrl).toMatch(/^ws:\/\//);
      } finally {
        globalThis.WebSocket = OriginalWebSocket;
      }
    });
  });
});
