import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../context/authStore';

function buildWebSocketUrl(accessToken: string): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit?.trim()) {
    const base = explicit.replace(/\/$/, '');
    return `${base}?token=${encodeURIComponent(accessToken)}`;
  }
  const api = import.meta.env.VITE_API_URL as string | undefined;
  if (api && /^https?:\/\//i.test(api)) {
    try {
      const u = new URL(api);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${u.host}/ws?token=${encodeURIComponent(accessToken)}`;
    } catch {
      /* fall through */
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws?token=${encodeURIComponent(accessToken)}`;
}

type CampaignTouchMessage = { type: 'campaign_touch'; campaignId: string };

/**
 * Pushes campaign/dashboard updates from the API via WebSocket (Redis → API → browser).
 * When connected, React Query polling on the campaigns page can back off.
 */
export function useCampaignRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.userAuth?.accessToken ?? null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const intentionalClose = useRef(false);

  useEffect(() => {
    intentionalClose.current = false;
    if (!enabled || !accessToken) {
      setConnected(false);
      return undefined;
    }

    const wsUrl = buildWebSocketUrl(accessToken);

    const scheduleReconnect = () => {
      if (intentionalClose.current) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => connect(), 3000);
    };

    function connect() {
      if (intentionalClose.current) return;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => setConnected(true);
        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;
          scheduleReconnect();
        };
        ws.onerror = () => {
          ws.close();
        };
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data)) as CampaignTouchMessage;
            if (data.type !== 'campaign_touch' || !data.campaignId) return;
            void queryClient.invalidateQueries(['campaigns']);
            void queryClient.invalidateQueries({ queryKey: ['campaign', data.campaignId] });
            void queryClient.invalidateQueries(['dashboard-stats']);
          } catch {
            /* ignore */
          }
        };
      } catch {
        setConnected(false);
        scheduleReconnect();
      }
    }

    connect();

    return () => {
      intentionalClose.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled, accessToken, queryClient]);

  return { connected };
}
