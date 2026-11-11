import { apiService } from './services/api';
import { realtimeSSE } from './services/sse';
import type { CreateTeamDto, Team, UpdateTeamDto } from './types/team';
import { renderKpiCards, type KpiData } from './components/KpiCards';
import { renderTeamTable } from './components/TeamTable';
import { TeamModal } from './components/TeamModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Toast } from './components/Toast';

class TeamApp {
  private appRoot: HTMLElement;
  private teams: Team[] = [];
  private isLoading = true;
  private searchQuery = '';
  private isSseConnected = false;
  private searchDebounceTimer: number | null = null;

  private teamModal!: TeamModal;
  private confirmModal!: ConfirmModal;

  constructor(appRoot: HTMLElement) {
    this.appRoot = appRoot;
  }

  public async init(): Promise<void> {
    this.teamModal = new TeamModal();
    this.confirmModal = new ConfirmModal();

    this.renderSkeleton();
    this.setupSSE();
    await this.fetchTeams();
  }

  private calculateKpi(): KpiData {
    const totalTeams = this.teams.length;
    let totalMembers = 0;
    let fullTeams = 0;

    for (const t of this.teams) {
      const m1 = t.member1?.trim() ? 1 : 0;
      const m2 = t.member2?.trim() ? 1 : 0;
      totalMembers += m1 + m2;
      if (m1 === 1 && m2 === 1) {
        fullTeams += 1;
      }
    }

    return { totalTeams, totalMembers, fullTeams };
  }

  private renderSkeleton(): void {
    const kpi = this.calculateKpi();

    this.appRoot.innerHTML = `
      <div class="app-container">
        <!-- Header -->
        <header class="app-header">
          <div class="brand-section">
            <div class="brand-logo">2P</div>
            <div class="brand-info">
              <h1>QUẢN LÝ ĐỘI 2 NGƯỜI</h1>
              <div class="brand-sub">
                <span id="sse-status-pill" class="t1-pill ${this.isSseConnected ? 't1-pill-success' : 't1-pill-warning'}">
                  ${this.isSseConnected ? '● Realtime Đang Bật' : '○ Đang Kết Nối Realtime...'}
                </span>
                <span>• T1 3D Design System</span>
              </div>
            </div>
          </div>
          <div>
            <button id="btn-add-team-main" class="t1-btn t1-btn-primary">
              <span style="font-size: 16px;">＋</span>
              <span>Thêm Đội Mới</span>
            </button>
          </div>
        </header>

        <!-- KPI Section -->
        <div id="kpi-section">
          ${renderKpiCards(kpi)}
        </div>

        <!-- Toolbar Section -->
        <div class="t1-card toolbar-card">
          <div class="search-box-wrapper">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              id="search-input"
              class="t1-input search-input-field"
              placeholder="Tìm theo tên đội hoặc tên thành viên (tự động lọc sau 300ms)..."
              value="${this.searchQuery}"
            />
          </div>
          <div style="font-size: 13px; font-weight: 700; color: var(--t1-text-muted);" id="counter-summary">
            Hiển thị: <strong>${this.teams.length}</strong> đội
          </div>
        </div>

        <!-- Team Table Section -->
        <div id="table-container">
          ${renderTeamTable(this.teams, this.isLoading, this.searchQuery)}
        </div>
      </div>
    `;

    this.bindDOMEvents();
  }

  private updateUI(): void {
    const kpiSection = document.getElementById('kpi-section');
    if (kpiSection) {
      kpiSection.innerHTML = renderKpiCards(this.calculateKpi());
    }

    const counterSummary = document.getElementById('counter-summary');
    if (counterSummary) {
      counterSummary.innerHTML = `Hiển thị: <strong>${this.filteredTeams().length}</strong> đội`;
    }

    const tableContainer = document.getElementById('table-container');
    if (tableContainer) {
      tableContainer.innerHTML = renderTeamTable(this.filteredTeams(), this.isLoading, this.searchQuery);
      this.bindTableButtons();
    }

    const ssePill = document.getElementById('sse-status-pill');
    if (ssePill) {
      ssePill.className = `t1-pill ${this.isSseConnected ? 't1-pill-success' : 't1-pill-warning'}`;
      ssePill.textContent = this.isSseConnected ? '● Realtime Đang Bật' : '○ Đang Kết Nối Realtime...';
    }
  }

  private filteredTeams(): Team[] {
    if (!this.searchQuery.trim()) {
      return this.teams;
    }
    const q = this.searchQuery.trim().toLowerCase();
    return this.teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.member1.toLowerCase().includes(q) ||
        t.member2.toLowerCase().includes(q)
    );
  }

  private bindDOMEvents(): void {
    const addBtn = document.getElementById('btn-add-team-main');
    addBtn?.addEventListener('click', () => {
      this.teamModal.open(undefined, async (dto) => {
        await this.handleCreateTeam(dto as CreateTeamDto);
      });
    });

    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      if (this.searchDebounceTimer !== null) {
        window.clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = window.setTimeout(() => {
        this.searchQuery = val;
        this.updateUI();
      }, 300);
    });

    this.bindTableButtons();
  }

  private bindTableButtons(): void {
    const editBtns = document.querySelectorAll('.btn-edit-team');
    editBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const team = this.teams.find((t) => t.id === id);
        if (team) {
          this.teamModal.open(team, async (dto) => {
            await this.handleUpdateTeam(team.id, dto as UpdateTeamDto);
          });
        }
      });
    });

    const deleteBtns = document.querySelectorAll('.btn-delete-team');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name') || 'đội này';
        if (id) {
          this.confirmModal.open(name, async () => {
            await this.handleDeleteTeam(id, name);
          });
        }
      });
    });
  }

  private async fetchTeams(): Promise<void> {
    this.isLoading = true;
    this.updateUI();
    try {
      const res = await apiService.getTeams();
      this.teams = res.teams;
    } catch (err) {
      Toast.error(`Lỗi tải danh sách: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.isLoading = false;
      this.updateUI();
    }
  }

  private async handleCreateTeam(dto: CreateTeamDto): Promise<void> {
    try {
      const created = await apiService.createTeam(dto);
      // Cập nhật local nếu chưa nhận SSE
      if (!this.teams.some((t) => t.id === created.id)) {
        this.teams.push(created);
        this.teams.sort((a, b) => a.createdAt - b.createdAt);
        this.updateUI();
      }
      Toast.success(`Đã tạo "${created.name}" thành công!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Toast.error(`Tạo đội thất bại: ${msg}`);
      throw err;
    }
  }

  private async handleUpdateTeam(id: string, dto: UpdateTeamDto): Promise<void> {
    try {
      const updated = await apiService.updateTeam(id, dto);
      const index = this.teams.findIndex((t) => t.id === id);
      if (index !== -1) {
        this.teams[index] = updated;
        this.updateUI();
      }
      Toast.success(`Đã cập nhật "${updated.name}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Toast.error(`Cập nhật thất bại: ${msg}`);
      throw err;
    }
  }

  private async handleDeleteTeam(id: string, name: string): Promise<void> {
    const previous = [...this.teams];
    // Optimistic delete
    this.teams = this.teams.filter((t) => t.id !== id);
    this.updateUI();

    try {
      await apiService.deleteTeam(id);
      Toast.success(`Đã xóa "${name}"`);
    } catch (err) {
      // Rollback nếu có lỗi
      this.teams = previous;
      this.updateUI();
      const msg = err instanceof Error ? err.message : String(err);
      Toast.error(`Không thể xóa: ${msg}`);
      throw err;
    }
  }

  private setupSSE(): void {
    realtimeSSE.onStatusChange((status) => {
      this.isSseConnected = status;
      const ssePill = document.getElementById('sse-status-pill');
      if (ssePill) {
        ssePill.className = `t1-pill ${status ? 't1-pill-success' : 't1-pill-warning'}`;
        ssePill.textContent = status ? '● Realtime Đang Bật' : '○ Đang Kết Nối Realtime...';
      }
    });

    realtimeSSE.onEvent((event) => {
      if (event.type === 'team_created') {
        const team = event.data;
        if (!this.teams.some((t) => t.id === team.id)) {
          this.teams.push(team);
          this.teams.sort((a, b) => a.createdAt - b.createdAt);
          this.updateUI();
          Toast.info(`Sự kiện Realtime: "${team.name}" vừa được tạo!`);
        }
      } else if (event.type === 'team_updated') {
        const team = event.data;
        const idx = this.teams.findIndex((t) => t.id === team.id);
        if (idx !== -1) {
          this.teams[idx] = team;
          this.updateUI();
        } else {
          this.teams.push(team);
          this.teams.sort((a, b) => a.createdAt - b.createdAt);
          this.updateUI();
        }
      } else if (event.type === 'team_deleted') {
        const { id } = event.data;
        this.teams = this.teams.filter((t) => t.id !== id);
        this.updateUI();
      } else if (event.type === 'sync_all') {
        this.teams = event.data;
        this.teams.sort((a, b) => a.createdAt - b.createdAt);
        this.updateUI();
      }
    });

    realtimeSSE.connect();
  }
}

// Khởi tạo app khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    const app = new TeamApp(root);
    app.init().catch(console.error);
  }
});
