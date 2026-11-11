import type { ApiResponse, CreateTeamDto, Team, TeamListResponse, UpdateTeamDto } from '../types/team';

const API_BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '') + '/api';

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err) {
      throw new Error(`Lỗi kết nối máy chủ: ${err instanceof Error ? err.message : String(err)}`);
    }

    let json: ApiResponse<T>;
    try {
      json = await response.json();
    } catch {
      throw new Error(`Máy chủ trả về phản hồi không hợp lệ (${response.status})`);
    }

    if (!response.ok || !json.success) {
      const errorMessage = json.error?.message || json.message || `Lỗi yêu cầu HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return json.data as T;
  }

  public async getTeams(search?: string): Promise<TeamListResponse> {
    const query = search ? `?search=${encodeURIComponent(search.trim())}` : '';
    return this.request<TeamListResponse>(`/teams${query}`);
  }

  public async createTeam(dto: CreateTeamDto): Promise<Team> {
    return this.request<Team>('/teams', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  public async updateTeam(id: string, dto: UpdateTeamDto): Promise<Team> {
    return this.request<Team>(`/teams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  public async deleteTeam(id: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/teams/${id}`, {
      method: 'DELETE',
    });
  }

  public async checkHealth(): Promise<{ status: string; firebaseConnected: boolean }> {
    return this.request<{ status: string; firebaseConnected: boolean }>('/health');
  }
}

export const apiService = new ApiService();
