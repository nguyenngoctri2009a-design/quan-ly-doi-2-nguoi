export interface Team {
  id: string;
  name: string;
  member1: string;
  member2: string;
  customName: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTeamDto {
  name?: string;
  member1?: string;
  member2?: string;
}

export interface UpdateTeamDto {
  name?: string;
  member1?: string;
  member2?: string;
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
