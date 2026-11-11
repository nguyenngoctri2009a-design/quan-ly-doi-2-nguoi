import { apiService } from './services/api';
import { realtimeSSE } from './services/sse';
import type { CreateTeamDto, Team, UpdateTeamDto } from './types/team';
import { renderKpiCards, type KpiData } from './components/KpiCards';
import { renderTeamTable } from './components/TeamTable';
import { TeamModal } from './components/TeamModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Toast } from './components/Toast';

type ActiveTab = 'list' | 'create';

class TeamApp {
  private appRoot: HTMLElement;
  private teams: Team[] = [];
  private isLoading = true;
  private searchQuery = '';
  private isSseConnected = false;
  private currentTab: ActiveTab = 'list';
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
              <h1>HỆ THỐNG QUẢN LÝ ĐỘI 2 NGƯỜI</h1>
              <div class="brand-sub">
                <span id="sse-status-pill" class="t1-pill ${this.isSseConnected ? 't1-pill-success' : 't1-pill-warning'}">
                  ${this.isSseConnected ? '● Realtime Đang Bật' : '○ Đang Kết Nối Realtime...'}
                </span>
                <span>• T1 3D Design System</span>
              </div>
            </div>
          </div>
        </header>

        <!-- HỆ THỐNG TAB ĐIỀU HƯỚNG RIÊNG BIỆT -->
        <div class="t1-tabs-nav">
          <button class="t1-tab-btn ${this.currentTab === 'list' ? 'active' : ''}" id="tab-nav-list">
            <span>📋</span>
            <span>Danh Sách Đội & KPI</span>
          </button>
          <button class="t1-tab-btn ${this.currentTab === 'create' ? 'active' : ''}" id="tab-nav-create">
            <span>➕</span>
            <span>Tạo Đội Mới (Tab Riêng)</span>
          </button>
        </div>

        <!-- TAB 1: DANH SÁCH ĐỘI & KPI -->
        <div id="tab-content-list" style="display: ${this.currentTab === 'list' ? 'block' : 'none'};">
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

        <!-- TAB 2: TẠO ĐỘI MỚI (TAB RIÊNG BIỆT, CỨ ẤN CỘNG LÀ HIỆN Ô NHẬP TÊN) -->
        <div id="tab-content-create" style="display: ${this.currentTab === 'create' ? 'block' : 'none'};">
          <div class="t1-card" style="max-width: 640px; margin: 0 auto; padding: 32px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
              <span style="font-size: 28px;">🏆</span>
              <div>
                <h2 style="margin: 0; font-size: 22px; font-weight: 900; color: var(--t1-text);">
                  Đăng Ký Đội Thi Đấu Mới
                </h2>
                <div style="font-size: 13px; color: var(--t1-text-muted); font-weight: 600; margin-top: 2px;">
                  Nhập tên đội tùy chỉnh hoặc để trống để nhận số mặc định tự động.
                </div>
              </div>
            </div>

            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />

            <form id="tab-create-form">
              <div class="form-group">
                <label class="form-label" for="tab-input-team-name">TÊN ĐỘI</label>
                <input
                  type="text"
                  id="tab-input-team-name"
                  class="t1-input"
                  placeholder="VD: Đội 1, Chiến Binh Rồng, Sát Thủ... (Để trống tự tăng)"
                  maxlength="50"
                />
                <div class="form-hint">Nếu để trống, hệ thống sẽ tự động cấp số thứ tự nhỏ nhất chưa dùng.</div>
              </div>

              <div class="form-group" style="margin-top: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <label class="form-label" style="margin: 0;">
                    DANH SÁCH THÀNH VIÊN (TỐI ĐA 2 NGƯỜI)
                  </label>
                  <button type="button" class="t1-btn t1-btn-primary" id="tab-btn-add-member" style="padding: 7px 16px; font-size: 12.5px;">
                    <span>＋ Thêm Ô Nhập Tên</span>
                  </button>
                </div>

                <div id="tab-member-inputs-container" class="member-inputs-container">
                  <!-- Cứ ấn nút cộng sẽ tự động hiện thêm ô nhập tại đây -->
                </div>
              </div>

              <div id="tab-create-error" style="display: none; margin-bottom: 18px; padding: 12px 16px; border-radius: 12px; background: #fee2e2; color: #991b1b; font-size: 13px; font-weight: 700;"></div>

              <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 28px;">
                <button type="button" class="t1-btn t1-btn-secondary" id="tab-btn-reset-form">
                  Làm Lại
                </button>
                <button type="submit" class="t1-btn t1-btn-success" id="tab-btn-submit-team" style="padding: 12px 28px; font-size: 14px;">
                  <span>💾 Lưu Đội & Bắt Đầu</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    this.bindDOMEvents();
    this.initTabCreateForm();
  }

  private switchTab(tab: ActiveTab): void {
    this.currentTab = tab;
    const tabListNav = document.getElementById('tab-nav-list');
    const tabCreateNav = document.getElementById('tab-nav-create');
    const contentList = document.getElementById('tab-content-list');
    const contentCreate = document.getElementById('tab-content-create');

    if (tab === 'list') {
      tabListNav?.classList.add('active');
      tabCreateNav?.classList.remove('active');
      if (contentList) contentList.style.display = 'block';
      if (contentCreate) contentCreate.style.display = 'none';
      this.updateUI();
    } else {
      tabListNav?.classList.remove('active');
      tabCreateNav?.classList.add('active');
      if (contentList) contentList.style.display = 'none';
      if (contentCreate) contentCreate.style.display = 'block';
    }
  }

  private initTabCreateForm(): void {
    const container = document.getElementById('tab-member-inputs-container');
    if (!container) return;
    container.innerHTML = '';
    // Ban đầu tự tạo sẵn 1 ô đầu tiên
    this.addTabMemberField('');
  }

  private addTabMemberField(val = ''): void {
    const container = document.getElementById('tab-member-inputs-container');
    if (!container) return;
    const currentRows = container.querySelectorAll('.dynamic-member-row');
    if (currentRows.length >= 2) {
      Toast.warning('Mỗi đội tối đa 2 thành viên!');
      return;
    }

    const idx = currentRows.length + 1;
    const row = document.createElement('div');
    row.className = 'dynamic-member-row';
    row.innerHTML = `
      <div class="member-input-badge">#${idx}</div>
      <input
        type="text"
        class="t1-input tab-member-name-input"
        placeholder="Nhập tên thành viên ${idx}..."
        maxlength="50"
        value="${val}"
      />
      <button type="button" class="btn-remove-member" title="Xóa ô nhập này">✕</button>
    `;

    const removeBtn = row.querySelector('.btn-remove-member');
    removeBtn?.addEventListener('click', () => {
      row.remove();
      this.reindexTabMemberFields();
    });

    container.appendChild(row);
    const input = row.querySelector('input') as HTMLInputElement;
    input.focus();
    this.updateTabAddBtnState();
  }

  private reindexTabMemberFields(): void {
    const container = document.getElementById('tab-member-inputs-container');
    if (!container) return;
    const rows = container.querySelectorAll('.dynamic-member-row');
    rows.forEach((r, idx) => {
      const badge = r.querySelector('.member-input-badge');
      const input = r.querySelector('input');
      if (badge) badge.textContent = `#${idx + 1}`;
      if (input) input.placeholder = `Nhập tên thành viên ${idx + 1}...`;
    });
    this.updateTabAddBtnState();
  }

  private updateTabAddBtnState(): void {
    const container = document.getElementById('tab-member-inputs-container');
    const addBtn = document.getElementById('tab-btn-add-member');
    if (container && addBtn) {
      const count = container.querySelectorAll('.dynamic-member-row').length;
      addBtn.style.display = count >= 2 ? 'none' : 'inline-flex';
    }
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
    // Chuyển Tab
    document.getElementById('tab-nav-list')?.addEventListener('click', () => this.switchTab('list'));
    document.getElementById('tab-nav-create')?.addEventListener('click', () => this.switchTab('create'));

    // Thêm ô nhập tên khi bấm dấu cộng trong Tab Tạo Đội
    document.getElementById('tab-btn-add-member')?.addEventListener('click', () => {
      this.addTabMemberField('');
    });

    // Nút làm lại form
    document.getElementById('tab-btn-reset-form')?.addEventListener('click', () => {
      const nameInp = document.getElementById('tab-input-team-name') as HTMLInputElement;
      if (nameInp) nameInp.value = '';
      this.initTabCreateForm();
    });

    // Submit form trong Tab Tạo Đội
    const tabForm = document.getElementById('tab-create-form') as HTMLFormElement;
    tabForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleTabCreateSubmit();
    });

    // Tìm kiếm với Debounce 300ms
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

  private async handleTabCreateSubmit(): Promise<void> {
    const nameInp = document.getElementById('tab-input-team-name') as HTMLInputElement;
    const submitBtn = document.getElementById('tab-btn-submit-team') as HTMLButtonElement;
    const errBox = document.getElementById('tab-create-error') as HTMLElement;
    const container = document.getElementById('tab-member-inputs-container');

    const inputs = container?.querySelectorAll('.tab-member-name-input') as NodeListOf<HTMLInputElement>;
    const members: string[] = [];
    inputs?.forEach((inp) => {
      const val = inp.value.trim();
      if (val) members.push(val);
    });

    const name = nameInp ? nameInp.value.trim() : '';
    const member1 = members[0] || '';
    const member2 = members[1] || '';

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Đang lưu...</span>';
    errBox.style.display = 'none';

    try {
      const dto: CreateTeamDto = {
        name: name || undefined,
        member1: member1 || undefined,
        member2: member2 || undefined,
      };
      await this.handleCreateTeam(dto);

      // Reset form
      if (nameInp) nameInp.value = '';
      this.initTabCreateForm();

      // Tự động chuyển về Tab Danh Sách để xem kết quả
      this.switchTab('list');
    } catch (err) {
      errBox.textContent = err instanceof Error ? err.message : String(err);
      errBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>💾 Lưu Đội & Bắt Đầu</span>';
    }
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

    // Nút cộng trực tiếp trong slot thành viên trên bảng
    const slotAddBtns = document.querySelectorAll('.btn-slot-add');
    slotAddBtns.forEach((btn) => {
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
    this.teams = this.teams.filter((t) => t.id !== id);
    this.updateUI();

    try {
      await apiService.deleteTeam(id);
      Toast.success(`Đã xóa "${name}"`);
    } catch (err) {
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

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    const app = new TeamApp(root);
    app.init().catch(console.error);
  }
});
