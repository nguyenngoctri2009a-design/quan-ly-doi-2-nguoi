import type { TeamEventType } from '../types/team';

type EventCallback = (event: TeamEventType) => void;
type StatusCallback = (connected: boolean) => void;

class RealtimeSSE {
  private eventSource: EventSource | null = null;
  private listeners: EventCallback[] = [];
  private statusListeners: StatusCallback[] = [];
  private isConnected = false;
  private reconnectTimeoutId: number | null = null;

  public connect(): void {
    if (this.eventSource) {
      this.disconnect();
    }

    try {
      const baseUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '';
      this.eventSource = new EventSource(`${baseUrl}/api/teams/events`);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.notifyStatus(true);
      };

      this.eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.notifyListeners(parsed);
        } catch (e) {
          console.warn('Failed to parse SSE payload:', e);
        }
      };

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.notifyStatus(false);
        this.eventSource?.close();
        this.eventSource = null;

        // Schedule auto-reconnect in 4 seconds
        if (this.reconnectTimeoutId === null) {
          this.reconnectTimeoutId = window.setTimeout(() => {
            this.reconnectTimeoutId = null;
            this.connect();
          }, 4000);
        }
      };
    } catch (e) {
      console.error('SSE initialization error:', e);
      this.notifyStatus(false);
    }
  }

  public disconnect(): void {
    if (this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
    this.notifyStatus(false);
  }

  public onEvent(callback: EventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.push(callback);
    callback(this.isConnected);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners(event: TeamEventType): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in SSE event listener:', err);
      }
    }
  }

  private notifyStatus(status: boolean): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('Error in SSE status listener:', err);
      }
    }
  }
}

export const realtimeSSE = new RealtimeSSE();
