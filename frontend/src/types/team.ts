export interface TournamentState {
  isActive: boolean;
  mode: string;
  startedAt?: number;
  endedAt?: number;
}

export interface MatchItem {
  id: string;
  roundIndex: number;
  team1Id: string;
  team2Id?: string; // Có thể để trống nếu bye (đặc cách vào vòng trong)
  team1Name: string;
  team2Name?: string;
  winnerId?: string;
  winnerName?: string;
  isBye?: boolean; // Được đặc cách vào thẳng vòng trong
  completed: boolean;
}

export interface RoundItem {
  roundIndex: number;
  name: string; // VD: "Vòng 1 (Vòng Loại)", "Tứ Kết", "Bán Kết", "Chung Kết"
  matches: MatchItem[];
}

export interface BracketState {
  currentRoundIndex: number;
  rounds: RoundItem[];
  championId?: string;
  championName?: string;
  updatedAt?: number;
}

export interface MemberItem {
  name: string;
  stk?: string; // STK gồm tối đa 6 số
}

export interface Team {
  id: string;
  name: string;
  member1: string;
  member2: string;
  members?: string[];
  memberDetails?: MemberItem[]; // Danh sách thành viên kèm STK 6 số
  customName: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTeamDto {
  name?: string;
  member1?: string;
  member2?: string;
  members?: string[];
  memberDetails?: MemberItem[];
}

export interface UpdateTeamDto {
  name?: string;
  member1?: string;
  member2?: string;
  members?: string[];
  memberDetails?: MemberItem[];
}

export interface TeamListResponse {
  teams: Team[];
  totalTeams: number;
  totalMembers: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: ApiErrorBody;
}

export type TeamEventType =
  | { type: 'team_created'; data: Team }
  | { type: 'team_updated'; data: Team }
  | { type: 'team_deleted'; data: { id: string } }
  | { type: 'sync_all'; data: Team[] }
  | { type: 'tournament_state'; data: TournamentState };

export type TournamentMode = '1v1' | '2v2' | '3v3' | '4v4' | '5v5' | '10v10' | 'custom';
