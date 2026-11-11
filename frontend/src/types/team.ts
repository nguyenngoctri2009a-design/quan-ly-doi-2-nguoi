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
  | { type: 'sync_all'; data: Team[] };

export type TournamentMode = '1v1' | '2v2' | '3v3' | '4v4' | '5v5' | '10v10' | 'custom';
