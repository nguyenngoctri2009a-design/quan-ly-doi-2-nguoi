import type { ApiResponse, CreateTeamDto, MemberItem, Team, TeamListResponse, UpdateTeamDto } from '../types/team';

const FIREBASE_RTDB_URL = 'https://mechamay-7cbce-default-rtdb.asia-southeast1.firebasedatabase.app';
const API_BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '') + '/api';

class ApiService {
  private useDirectFirebase = false;

  private async tryBackend<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
    if (this.useDirectFirebase) return null;

    try {
      const url = `${API_BASE}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (response.status === 404) {
        this.useDirectFirebase = true;
        return null;
      }

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message || json?.message || `Lỗi HTTP ${response.status}`);
      }

      const json: ApiResponse<T> = await response.json();
      return json.data as T;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        this.useDirectFirebase = true;
        return null;
      }
      throw err;
    }
  }

  // --- TRỰC TIẾP FIREBASE REALTIME DATABASE ---
  private async firebaseGetTeams(): Promise<TeamListResponse> {
    const res = await fetch(`${FIREBASE_RTDB_URL}/teams.json`);
    if (!res.ok) throw new Error(`Lỗi Firebase: HTTP ${res.status}`);
    const data: Record<string, Team> | null = await res.json();

    const teams: Team[] = data ? Object.values(data) : [];
    
    // Đồng bộ members và memberDetails
    for (const t of teams) {
      if (!t.memberDetails || !Array.isArray(t.memberDetails) || t.memberDetails.length === 0) {
        const details: MemberItem[] = [];
        if (t.members && Array.isArray(t.members) && t.members.length > 0) {
          for (const m of t.members) {
            if (m.trim()) details.push({ name: m.trim(), stk: '' });
          }
        } else {
          if (t.member1?.trim()) details.push({ name: t.member1.trim(), stk: '' });
          if (t.member2?.trim()) details.push({ name: t.member2.trim(), stk: '' });
        }
        t.memberDetails = details;
      }

      if (!t.members || t.members.length === 0) {
        t.members = (t.memberDetails || []).map((m) => m.name);
      }
    }

    teams.sort((a, b) => a.createdAt - b.createdAt);

    const totalTeams = teams.length;
    let totalMembers = 0;
    for (const t of teams) {
      totalMembers += (t.memberDetails || []).filter((m) => m.name.trim().length > 0).length;
    }

    return { teams, totalTeams, totalMembers };
  }

  public findNextDefaultNumber(existingTeams: Team[]): number {
    const used = new Set<number>();
    for (const team of existingTeams) {
      const trimmed = team.name.trim();
      if (trimmed.startsWith('Đội ')) {
        const num = parseInt(trimmed.substring(4).trim(), 10);
        if (!isNaN(num) && num > 0) used.add(num);
      } else if (trimmed.startsWith('Doi ')) {
        const num = parseInt(trimmed.substring(4).trim(), 10);
        if (!isNaN(num) && num > 0) used.add(num);
      }
    }
    let candidate = 1;
    while (used.has(candidate)) candidate++;
    return candidate;
  }

  public async getTeams(search?: string): Promise<TeamListResponse> {
    const fromBackend = await this.tryBackend<TeamListResponse>(`/teams${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    if (fromBackend) {
      for (const t of fromBackend.teams) {
        if (!t.memberDetails || t.memberDetails.length === 0) {
          const details: MemberItem[] = [];
          if (t.members && t.members.length > 0) {
            t.members.forEach((m) => details.push({ name: m, stk: '' }));
          } else {
            if (t.member1?.trim()) details.push({ name: t.member1.trim(), stk: '' });
            if (t.member2?.trim()) details.push({ name: t.member2.trim(), stk: '' });
          }
          t.memberDetails = details;
          t.members = details.map((d) => d.name);
        }
      }
      return fromBackend;
    }

    const res = await this.firebaseGetTeams();
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      res.teams = res.teams.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.memberDetails && t.memberDetails.some((m) => m.name.toLowerCase().includes(q) || (m.stk && m.stk.includes(q)))) ||
          (t.members && t.members.some((m) => m.toLowerCase().includes(q))) ||
          t.member1.toLowerCase().includes(q) ||
          t.member2.toLowerCase().includes(q)
      );
    }
    return res;
  }

  public async createTeam(dto: CreateTeamDto): Promise<Team> {
    const fromBackend = await this.tryBackend<Team>('/teams', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    if (fromBackend) return fromBackend;

    // Firebase Direct mode
    const current = await this.firebaseGetTeams();
    let finalName = dto.name?.trim();
    let customName = false;

    if (finalName) {
      // Nếu tên người dùng nhập khác với dạng "Đội n"
      customName = true;
    } else {
      const nextNum = this.findNextDefaultNumber(current.teams);
      finalName = `Đội ${nextNum}`;
    }

    const memberDetails: MemberItem[] = dto.memberDetails && dto.memberDetails.length > 0
      ? dto.memberDetails.filter((m) => m.name.trim().length > 0)
      : (dto.members || []).map((m) => ({ name: m.trim(), stk: '' })).filter((m) => m.name.length > 0);

    const members: string[] = memberDetails.map((m) => m.name);

    const now = Date.now();
    const id = 'team_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const newTeam: Team = {
      id,
      name: finalName,
      member1: members[0] || '',
      member2: members[1] || '',
      members,
      memberDetails,
      customName,
      createdAt: now,
      updatedAt: now,
    };

    const res = await fetch(`${FIREBASE_RTDB_URL}/teams/${id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTeam),
    });

    if (!res.ok) throw new Error('Không thể lưu đội vào Firebase');
    return newTeam;
  }

  public async updateTeam(id: string, dto: UpdateTeamDto): Promise<Team> {
    const fromBackend = await this.tryBackend<Team>(`/teams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
    if (fromBackend) return fromBackend;

    const getRes = await fetch(`${FIREBASE_RTDB_URL}/teams/${id}.json`);
    const currentTeam: Team | null = await getRes.json();
    if (!currentTeam) throw new Error('Không tìm thấy đội để cập nhật');

    let updatedName = currentTeam.name;
    let customName = currentTeam.customName;

    if (dto.name !== undefined && dto.name.trim()) {
      if (dto.name.trim() !== currentTeam.name) {
        updatedName = dto.name.trim();
        customName = true;
      }
    }

    let memberDetails: MemberItem[] = [];
    if (dto.memberDetails !== undefined) {
      memberDetails = dto.memberDetails.filter((m) => m.name.trim().length > 0);
    } else if (dto.members !== undefined) {
      memberDetails = dto.members.map((m) => ({ name: m.trim(), stk: '' })).filter((m) => m.name.length > 0);
    } else {
      memberDetails = currentTeam.memberDetails || [];
    }

    const members = memberDetails.map((m) => m.name);

    const updatedTeam: Team = {
      ...currentTeam,
      name: updatedName,
      member1: members[0] || '',
      member2: members[1] || '',
      members,
      memberDetails,
      customName,
      updatedAt: Date.now(),
    };

    const res = await fetch(`${FIREBASE_RTDB_URL}/teams/${id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTeam),
    });

    if (!res.ok) throw new Error('Không thể cập nhật đội trên Firebase');
    return updatedTeam;
  }

  public async deleteTeam(id: string): Promise<{ id: string }> {
    const fromBackend = await this.tryBackend<{ id: string }>(`/teams/${id}`, {
      method: 'DELETE',
    });
    if (fromBackend) return fromBackend;

    const res = await fetch(`${FIREBASE_RTDB_URL}/teams/${id}.json`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Không thể xóa đội trên Firebase');
    return { id };
  }

  public isDirectMode(): boolean {
    return this.useDirectFirebase;
  }
}

export const apiService = new ApiService();
