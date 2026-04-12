import { useEffect, useRef, useState, useCallback } from 'react';
import { StockQuote, WebSocketMessage } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

interface UseWebSocketReturn {
  quotes: Map<string, StockQuote>;
  isConnected: boolean;
  error: string | null;
  subscribe: (symbol: string) => void;
  unsubscribe: (symbol: string) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedSymbols = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        setError(null);

        // Resubscribe to previously subscribed symbols
        subscribedSymbols.current.forEach(symbol => {
          ws.send(JSON.stringify({ action: 'subscribe', symbol }));
        });
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'quote':
              if (message.data) {
                setQuotes(prev => {
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
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[WebSocket] Attempting to reconnect...');
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
        setError('WebSocket connection error');
      };
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err);
      setError('Failed to establish WebSocket connection');
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
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
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    fetchFn();

    const interval = setInterval(() => {
      fetchFn();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [fetchFn, intervalMs, enabled]);
}
