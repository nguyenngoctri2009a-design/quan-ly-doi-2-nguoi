import type { Team, TeamEventType } from '../types/team';

type EventCallback = (event: TeamEventType) => void;
type StatusCallback = (connected: boolean) => void;

const FIREBASE_RTDB_URL = 'https://mechamay-7cbce-default-rtdb.asia-southeast1.firebasedatabase.app';

class RealtimeSSE {
  private eventSource: EventSource | null = null;
  private listeners: EventCallback[] = [];
  private statusListeners: StatusCallback[] = [];
  private isConnected = false;
  private reconnectTimeoutId: number | null = null;
  private usingFirebaseDirect = false;

  public connect(): void {
    if (this.eventSource) {
      this.disconnect();
    }

    const baseUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '';
    const targetUrl = this.usingFirebaseDirect
      ? `${FIREBASE_RTDB_URL}/teams.json`
      : `${baseUrl || ''}/api/teams/events`;

    try {
      this.eventSource = new EventSource(targetUrl);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.notifyStatus(true);
      };

      this.eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.notifyListeners(parsed);
        } catch {
          // Message format might be raw string
        }
      };

      // Lắng nghe sự kiện "put" và "patch" chuẩn của Firebase Realtime Database
      this.eventSource.addEventListener('put', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.path === '/') {
            if (payload.data) {
              const teams: Team[] = Object.values(payload.data);
              this.notifyListeners({ type: 'sync_all', data: teams });
            } else {
              this.notifyListeners({ type: 'sync_all', data: [] });
            }
          } else if (payload.path && payload.path.startsWith('/')) {
            const id = payload.path.substring(1);
            if (!payload.data) {
              this.notifyListeners({ type: 'team_deleted', data: { id } });
            } else {
              this.notifyListeners({ type: 'team_updated', data: payload.data });
            }
          }
        } catch (e) {
          console.warn('Lỗi đọc sự kiện Firebase stream:', e);
        }
      });

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.notifyStatus(false);
        this.eventSource?.close();
        this.eventSource = null;

        // Nếu thất bại với backend URL, chuyển sang Firebase direct stream
        if (!this.usingFirebaseDirect) {
          console.warn('Backend SSE không khả dụng, chuyển sang kết nối trực tiếp Firebase EventStream...');
          this.usingFirebaseDirect = true;
          this.connect();
          return;
        }

        // Tự động reconnect sau 4 giây
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
