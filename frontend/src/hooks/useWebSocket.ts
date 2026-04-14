import { useEffect, useRef, useState, useCallback } from 'react';

import type { StockQuote, WebSocketMessage } from '../types';

// Dynamic WebSocket URL - works in both dev and production
// Uses current host, automatically switches between ws:// (http) and wss:// (https)
const getWebSocketUrl = (): string => {
  // Check for explicit env var first (useful for custom setups)
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) { return envUrl; }

  // In dev mode, connect directly to backend on port 3001
  if (import.meta.env.DEV) {
    return 'ws://localhost:3001/ws';
  }

  // In production, use current host (assumes frontend and backend are on same origin)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const { host } = window.location;
  return `${protocol}//${host}/ws`;
};

const WS_URL = getWebSocketUrl();

interface UseWebSocketReturn {
  quotes: Map<string, StockQuote>;
  isConnected: boolean;
  error: string | null;
  subscribe: (_symbol: string) => void;
  unsubscribe: (_symbol: string) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedSymbols = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intentionalClose = useRef(false);

  const connect = useCallback(() => {
    try {
      // Clear any existing reconnect timeout before creating new connection
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        setError(null);

        // Resubscribe to previously subscribed symbols
        subscribedSymbols.current.forEach((symbol) => {
          ws.send(JSON.stringify({ action: 'subscribe', symbol }));
        });
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'quote':
              if (message.data) {
                setQuotes((prev) => {
                  const newQuotes = new Map(prev);
                  newQuotes.set(message.data!.symbol, message.data!);
                  return newQuotes;
                });
              }
              break;

            case 'error':
              console.error('[WebSocket] Error:', message.error);
              setError(message.error || 'Unknown WebSocket error');
              break;

            case 'connected':
              console.log('[WebSocket] Server message:', message.message);
              break;
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        // Don't log or reconnect if this was an intentional close (cleanup)
        if (intentionalClose.current) {
          intentionalClose.current = false;
          return;
        }

        console.log('[WebSocket] Disconnected');
        setIsConnected(false);

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[WebSocket] Attempting to reconnect...');
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        // Don't log errors during intentional close (React StrictMode cleanup)
        if (intentionalClose.current) {
          return;
        }
        console.error('[WebSocket] Error:', err);
        setError('WebSocket connection error');
      };
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err);
      setError('Failed to establish WebSocket connection');
    }
  }, []);

  useEffect(() => {
    // Small delay to skip React StrictMode's double-mount in dev
    const timeout = setTimeout(() => {
      connect();
    }, import.meta.env.DEV ? 100 : 0);

    return () => {
      clearTimeout(timeout);
      // Mark this as an intentional close to prevent reconnect
      intentionalClose.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const subscribe = useCallback((symbol: string) => {
    const uppercaseSymbol = symbol.toUpperCase();
    subscribedSymbols.current.add(uppercaseSymbol);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe', symbol: uppercaseSymbol }));
    }
  }, []);

  const unsubscribe = useCallback((symbol: string) => {
    const uppercaseSymbol = symbol.toUpperCase();
    subscribedSymbols.current.delete(uppercaseSymbol);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'unsubscribe', symbol: uppercaseSymbol }));
    }
  }, []);

  return { quotes, isConnected, error, subscribe, unsubscribe };
}

export function useAutoRefresh(
  fetchFn: () => Promise<void>,
  intervalMs: number = 30000,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) { return; }

    // Initial fetch
    fetchFn();

    const interval = setInterval(() => {
      fetchFn();
    }, intervalMs);

    return () => { clearInterval(interval); };
  }, [fetchFn, intervalMs, enabled]);
}
