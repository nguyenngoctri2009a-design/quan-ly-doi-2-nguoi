import { apiService } from './services/api';
import { realtimeSSE } from './services/sse';
import type { CreateTeamDto, IgStkMember, MemberItem, ParsedIgStkItem, Team, TournamentMode, TournamentState, UpdateTeamDto, WaveAttendanceState } from './types/team';
import { renderKpiCards, type KpiData } from './components/KpiCards';
import { renderTeamTable } from './components/TeamTable';
import { TeamModal } from './components/TeamModal';
import { ConfirmModal } from './components/ConfirmModal';
import { PinModal } from './components/PinModal';
import { Toast } from './components/Toast';
import { exportIgStkToExcel, parseIgStkInput, renderIgStkTab } from './components/IgStkManager';
import { IgStkEditModal } from './components/IgStkEditModal';
import { renderWaveToolbar } from './components/WaveToolbar';
import { EliminatedTeamsModal } from './components/EliminatedTeamsModal';

type ActiveTab = 'list' | 'create' | 'manage' | 'igstk';

class TeamApp {
  private appRoot: HTMLElement;
  private teams: Team[] = [];
  private isLoading = true;
  private searchQuery = '';
  private isSseConnected = false;
  private currentTab: ActiveTab = 'list';
  private tournamentMode: TournamentMode = '3v3';
  private tournamentState: TournamentState = { isActive: false, mode: '3v3' };
  private waveState: WaveAttendanceState | null = null;
  private searchDebounceTimer: number | null = null;

  // Quản lý danh sách IG - STK
  private igStkMembers: IgStkMember[] = [];
  private parsedIgStkItems: ParsedIgStkItem[] = [];
  private igStkSearchQuery = '';
  private selectedIgStkIds = new Set<string>();
  private skipDuplicates = true;
  private igStkEditModal!: IgStkEditModal;
  private eliminatedTeamsModal!: EliminatedTeamsModal;

  private teamModal!: TeamModal;
  private confirmModal!: ConfirmModal;
  private pinModal!: PinModal;

  constructor(appRoot: HTMLElement) {
    this.appRoot = appRoot;
  }

  public async init(): Promise<void> {
    this.teamModal = new TeamModal();
    this.confirmModal = new ConfirmModal();
    this.pinModal = new PinModal();
    this.igStkEditModal = new IgStkEditModal();
    this.eliminatedTeamsModal = new EliminatedTeamsModal();

    this.renderSkeleton();
    this.setupSSE();

    // Tải trạng thái giải đấu & danh sách IG-STK đã lưu trước đó
    await this.fetchTournamentState();
    this.waveState = await apiService.getWaveAttendanceState();
    this.igStkMembers = await apiService.getIgStkMembers();
    await this.fetchTeams();
  }

  private async fetchTournamentState(): Promise<void> {
    try {
      this.tournamentState = await apiService.getTournamentState();
      if (this.tournamentState.mode) {
        this.tournamentMode = this.tournamentState.mode as TournamentMode;
      }

      // Đồng bộ UI sau khi tải trạng thái
      this.syncModeButtonsUI();
      this.updateTournamentBanner();
      this.updateCreateTabHint();
      if (this.currentTab === 'create') {
        const createContent = document.getElementById('tab-content-create');
        if (createContent) {
          createContent.innerHTML = this.renderCreateTabContent();
          this.bindCreateTabEvents();
          if (this.tournamentState.isActive) {
            this.initTabCreateForm();
          }
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc tournamentState:', e);
    }
  }

  private syncModeButtonsUI(): void {
    const isActive = this.tournamentState.isActive;
    const buttons = document.querySelectorAll('.btn-mode-toggle');
    buttons.forEach((btn) => {
      const bMode = btn.getAttribute('data-mode');
      if (bMode === this.tournamentMode) {
        btn.className = 't1-btn t1-btn-primary btn-mode-toggle';
      } else {
        btn.className = 't1-btn t1-btn-secondary btn-mode-toggle';
      }

      const buttonEl = btn as HTMLButtonElement;
      if (isActive) {
        buttonEl.disabled = true;
        buttonEl.style.opacity = bMode === this.tournamentMode ? '1' : '0.45';
        buttonEl.style.cursor = 'not-allowed';
        buttonEl.title = '🔒 Giải đấu đang diễn ra! Hãy kết thúc giải với mã PIN 2000 trước khi đổi thể thức.';
      } else {
        buttonEl.disabled = false;
        buttonEl.style.opacity = '1';
        buttonEl.style.cursor = 'pointer';
        buttonEl.title = `Chọn thể thức ${bMode?.toUpperCase()}`;
      }
    });

    const modeCard = document.getElementById('mode-selector-card');
    if (modeCard) {
      modeCard.style.display = isActive ? 'none' : 'flex';
    }
  }

  private getTargetCapacity(): number {
    const map: Record<TournamentMode, number> = {
      '1v1': 1,
      '2v2': 2,
      '3v3': 3,
      '4v4': 4,
      '5v5': 5,
      '10v10': 10,
      'custom': 0,
    };
    return map[this.tournamentMode];
  }

  private calculateKpi(): KpiData {
    const totalTeams = this.teams.length;
    let totalMembers = 0;
    let fullTeams = 0;
    const target = this.getTargetCapacity();

    for (const t of this.teams) {
      const details = (t.memberDetails && t.memberDetails.length > 0)
        ? t.memberDetails
        : (t.members || [t.member1, t.member2].filter(Boolean)).map((m) => ({ name: m, stk: '' }));

      const count = details.filter((m) => m.name.trim().length > 0).length;
      totalMembers += count;

      if (target > 0) {
        if (count >= target) fullTeams += 1;
      } else {
        if (count > 0) fullTeams += 1;
      }
    }

    return { totalTeams, totalMembers, fullTeams, targetPerTeam: target };
  }

  private renderSkeleton(): void {
    const kpi = this.calculateKpi();
    const nextDefaultNum = apiService.findNextDefaultNumber(this.teams);
    const isActive = this.tournamentState.isActive;

    this.appRoot.innerHTML = `
      <div class="app-container">
        <!-- Header -->
        <header class="app-header">
          <div class="brand-section">
            <div class="brand-logo">🏆</div>
            <div class="brand-info">
              <h1>HỆ THỐNG QUẢN LÝ GIẢI ĐẤU</h1>
              <div class="brand-sub">
                <span id="sse-status-pill" class="t1-pill ${this.isSseConnected ? 't1-pill-success' : 't1-pill-warning'}">
                  ${this.isSseConnected ? '● Realtime Đang Bật' : '○ Đang Kết Nối Realtime...'}
                </span>
                <span>• T1 3D Design System</span>
              </div>
            </div>
          </div>
        </header>

        <!-- BANNER TRẠNG THÁI GIẢI ĐẤU (ẤN BẮT ĐẦU MỚI MỞ KHÓA NHẬP ĐỘI) -->
        <div id="tournament-banner-wrapper">
          ${this.renderTournamentBanner()}
        </div>

        <!-- THANH ĐIỀU HƯỚNG 3 TAB CHÍNH & THỂ THỨC GIẢI -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 24px;">
          <!-- 4 Tabs Navigation -->
          <div class="t1-tabs-nav" style="margin-bottom: 0;">
            <button class="t1-tab-btn ${this.currentTab === 'list' ? 'active' : ''}" id="tab-nav-list">
              <span>📋</span>
              <span>Tab 1: Danh Sách & Điểm Danh Đợt</span>
            </button>
            <button class="t1-tab-btn ${this.currentTab === 'create' ? 'active' : ''}" id="tab-nav-create">
              <span>➕</span>
              <span>Tab 2: Tạo Đội Mới ${isActive ? `(Đội ${nextDefaultNum})` : '🔒'}</span>
            </button>
            <button class="t1-tab-btn ${this.currentTab === 'manage' ? 'active' : ''}" id="tab-nav-manage">
              <span>⚙️</span>
              <span>Tab 3: Chỉnh Tên, Thêm & Xóa Thành Viên</span>
            </button>
            <button class="t1-tab-btn ${this.currentTab === 'igstk' ? 'active' : ''}" id="tab-nav-igstk">
              <span>💳</span>
              <span>Tab 4: Danh Sách IG – STK</span>
            </button>
          </div>

          <!-- Tournament Mode Selector (Ẩn khi giải đấu đang diễn ra) -->
          <div id="mode-selector-card" class="t1-card" style="padding: 6px 14px; display: ${isActive ? 'none' : 'flex'}; align-items: center; gap: 8px; border-radius: 16px;">
            <span style="font-size: 11.5px; font-weight: 850; color: #64748b; text-transform: uppercase;">Thể Thức:</span>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="mode-buttons-container">
              <button class="t1-btn ${this.tournamentMode === '1v1' ? 't1-btn-primary' : 't1-btn-secondary'} btn-mode-toggle" data-mode="1v1" style="padding: 4px 10px; font-size: 11.5px;">1v1 Solo</button>
              <button class="t1-btn ${this.tournamentMode === '2v2' ? 't1-btn-primary' : 't1-btn-secondary'} btn-mode-toggle" data-mode="2v2" style="padding: 4px 10px; font-size: 11.5px;">2v2 Duo</button>
              <button class="t1-btn ${this.tournamentMode === '3v3' ? 't1-btn-primary' : 't1-btn-secondary'} btn-mode-toggle" data-mode="3v3" style="padding: 4px 10px; font-size: 11.5px;">3v3 Trio</button>
              <button class="t1-btn ${this.tournamentMode === '4v4' ? 't1-btn-primary' : 't1-btn-secondary'} btn-mode-toggle" data-mode="4v4" style="padding: 4px 10px; font-size: 11.5px;">4v4 Squad</button>
              <button class="t1-btn ${this.tournamentMode === '5v5' ? 't1-btn-primary' : 't1-btn-secondary'} btn-mode-toggle" data-mode="5v5" style="padding: 4px 10px; font-size: 11.5px;">5v5 Team</button>
              <button class="t1-btn ${this.tournamentMode === '10v10' ? 't1-btn-primary' : 't1-btn-secondary'} btn-mode-toggle" data-mode="10v10" style="padding: 4px 10px; font-size: 11.5px;">10v10 Đại Chiến</button>
              <button class="t1-btn ${this.tournamentMode === 'custom' ? 't1-btn-primary' : 't1-btn-secondary'} btn-mode-toggle" data-mode="custom" style="padding: 4px 10px; font-size: 11.5px;">Tự Do</button>
            </div>
          </div>
        </div>

        <!-- TAB 1: DANH SÁCH ĐỘI & KPI -->
        <div id="tab-content-list" style="display: ${this.currentTab === 'list' ? 'block' : 'none'};">
          <div id="kpi-section">
            ${renderKpiCards(kpi)}
          </div>

          <div id="wave-toolbar-container">
            ${renderWaveToolbar(this.waveState, this.getActiveTeams().length, isActive)}
          </div>

          <div class="t1-card toolbar-card">
            <div class="search-box-wrapper">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                id="search-input"
                class="t1-input search-input-field"
                placeholder="Tìm theo tên đội, tên thành viên hoặc STK (tự lọc sau 300ms)..."
                value="${this.searchQuery}"
              />
            </div>
            <div style="font-size: 13px; font-weight: 700; color: var(--t1-text-muted);" id="counter-summary">
              Hiển thị: <strong>${this.getActiveTeams().length}</strong> đội
            </div>
          </div>

          <div id="table-container">
            ${renderTeamTable(this.getActiveTeams(), this.isLoading, this.searchQuery, this.tournamentMode, this.waveState, isActive)}
          </div>
        </div>

        <!-- TAB 2: TẠO ĐỘI MỚI (CHỈ MỞ KHI ĐÃ ẤN BẮT ĐẦU GIẢI ĐẤU) -->
        <div id="tab-content-create" style="display: ${this.currentTab === 'create' ? 'block' : 'none'};">
          ${this.renderCreateTabContent()}
        </div>

        <!-- TAB 3: TRUNG TÂM CHỈNH TÊN ĐỘI, THÊM & XÓA THÀNH VIÊN -->
        <div id="tab-content-manage" style="display: ${this.currentTab === 'manage' ? 'block' : 'none'};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="margin: 0; font-size: 20px; font-weight: 900; color: var(--t1-text);">
                ⚙️ Quản Lý Đội & Thành Viên Trực Tiếp
              </h2>
              <div style="font-size: 13px; color: var(--t1-text-muted); font-weight: 600; margin-top: 2px;">
                Chỉnh sửa tên bất kỳ đội nào, thêm bớt thành viên, xóa thành viên cũ và cập nhật STK (6 số).
              </div>
            </div>
          </div>

          <div id="tab-manage-container">
            ${this.renderManageTab()}
          </div>
        </div>

        <!-- TAB 4: DANH SÁCH IG – STK & NHẬP NHANH -->
        <div id="tab-content-igstk" style="display: ${this.currentTab === 'igstk' ? 'block' : 'none'};">
          ${renderIgStkTab(this.igStkMembers, this.parsedIgStkItems, this.igStkSearchQuery, this.selectedIgStkIds, this.skipDuplicates)}
        </div>
      </div>
    `;

    this.bindDOMEvents();
    if (isActive) {
      this.initTabCreateForm();
    }
  }

  private renderCreateTabContent(): string {
    const isActive = this.tournamentState.isActive;
    const nextDefaultNum = apiService.findNextDefaultNumber(this.teams);
    const capacity = this.getTargetCapacity();

    if (!isActive) {
      return `
        <div class="t1-card" style="max-width: 640px; margin: 40px auto; padding: 48px 32px; text-align: center;">
          <div style="font-size: 54px; margin-bottom: 16px;">🔒</div>
          <h2 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 900; color: var(--t1-text);">
            GIẢI ĐẤU CHƯA BẮT ĐẦU
          </h2>
          <p style="margin: 0 0 24px 0; font-size: 14px; color: var(--t1-text-muted); font-weight: 600; line-height: 1.6;">
            Bạn cần bấm nút <strong>"🚀 BẮT ĐẦU GIẢI ĐẤU"</strong> ở banner phía trên trước khi tiến hành tạo và nhập các đội thi đấu.
          </p>
          <button type="button" class="t1-btn t1-btn-success" id="btn-start-from-tab" style="padding: 12px 28px; font-size: 14px; font-weight: 900;">
            <span>🚀 BẮT ĐẦU GIẢI ĐẤU NGAY</span>
          </button>
        </div>
      `;
    }

    const modeTitle = capacity > 0 ? `Đang đấu thể thức ${this.tournamentMode.toUpperCase()} (Tự tạo sẵn ${capacity} ô nhập)` : 'Thể thức Tự Do';

    return `
      <div class="t1-card" style="max-width: 680px; margin: 0 auto; padding: 32px;">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 8px;">
          <span style="font-size: 32px;">⚡</span>
          <div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 900; color: var(--t1-text);">
              Tạo Đội Mới (${this.tournamentMode.toUpperCase()})
            </h2>
            <div style="font-size: 13px; color: var(--t1-text-muted); font-weight: 600; margin-top: 2px;">
              ${modeTitle}. Có thể bấm nút ＋ để thêm bớt tùy ý.
            </div>
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />

        <form id="tab-create-form">
          <div class="form-group" style="position: relative;">
            <label class="form-label" for="tab-input-team-name">TÊN ĐỘI (MẶC ĐỊNH SẼ ĐẾM TỰ ĐỘNG)</label>
            <input
              type="text"
              id="tab-input-team-name"
              class="t1-input"
              placeholder="Để trống sẽ tự động lấy: Đội ${nextDefaultNum} (hoặc gõ chữ tìm kiếm)..."
              maxlength="50"
              autocomplete="off"
            />
            <div id="tab-team-name-dropdown" class="t1-autocomplete-dropdown" style="display: none;"></div>
            <div class="form-hint" id="tab-team-name-hint">
              💡 Để trống ô này: Hệ thống tự động đặt tên là <strong>Đội ${nextDefaultNum}</strong>
            </div>
          </div>

          <div class="form-group" style="margin-top: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <label class="form-label" style="margin: 0;">
                DANH SÁCH THÀNH VIÊN (${capacity > 0 ? `${capacity} người` : 'tự do'}) & Ô PHỤ STK (6 SỐ)
              </label>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="t1-btn t1-btn-primary" id="tab-btn-add-member" style="padding: 7px 16px; font-size: 12.5px;">
                  <span>＋ Thêm 1 Ô Nhập</span>
                </button>
                <button type="button" class="t1-btn t1-btn-gold" id="tab-btn-add-batch" style="padding: 7px 14px; font-size: 12.5px;" title="Thêm nhanh theo thể thức">
                  <span>⚡ Thêm ${capacity > 0 ? capacity : 3} Ô</span>
                </button>
              </div>
            </div>

            <div id="tab-member-inputs-container" class="member-inputs-container">
              <!-- Tự động sinh đúng số ô theo thể thức tại đây -->
            </div>
          </div>

          <div id="tab-create-error" style="display: none; margin-bottom: 18px; padding: 12px 16px; border-radius: 12px; background: #fee2e2; color: #991b1b; font-size: 13px; font-weight: 700;"></div>

          <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 28px;">
            <button type="button" class="t1-btn t1-btn-secondary" id="tab-btn-reset-form">
              Làm Lại
            </button>
            <button type="submit" class="t1-btn t1-btn-success" id="tab-btn-submit-team" style="padding: 12px 28px; font-size: 14px;">
              <span>💾 Lưu Đội & Xuất Trận</span>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  private renderTournamentBanner(): string {
    const isActive = this.tournamentState.isActive;

    if (isActive) {
      return `
        <div class="tournament-active-banner">
          <div style="display: flex; align-items: center; gap: 14px;">
            <span style="font-size: 32px; animation: bounceIcon 1s infinite alternate;">🔥</span>
            <div>
              <div style="font-size: 17px; font-weight: 900; letter-spacing: -0.3px;">
                GIẢI ĐẤU ĐANG DIỄN RA — THỂ THỨC: <span style="text-decoration: underline;">${this.tournamentMode.toUpperCase()}</span>
              </div>
            </div>
          </div>
          <div>
            <button class="t1-btn t1-btn-danger" id="btn-end-tournament" style="padding: 10px 22px; font-size: 13.5px; font-weight: 900; box-shadow: 0 4px 14px rgba(0,0,0,0.2);">
              <span>🛑 KẾT THÚC GIẢI ĐẤU</span>
            </button>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="t1-card" style="padding: 16px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border-color: #a7f3d0;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 26px;">🏁</span>
            <div>
              <div style="font-size: 15px; font-weight: 850; color: #065f46;">
                Khởi tranh giải đấu thể thức: <span style="font-weight: 900; color: #047857;">${this.tournamentMode.toUpperCase()}</span>
              </div>
              <div style="font-size: 12px; color: #047857; opacity: 0.8; font-weight: 600;">
                Bấm nút "🚀 BẮT ĐẦU GIẢI ĐẤU" bên cạnh để mở cổng tạo và đăng ký các đội thi đấu!
              </div>
            </div>
          </div>
          <div>
            <button class="t1-btn t1-btn-success" id="btn-start-tournament" style="padding: 10px 24px; font-size: 13.5px; font-weight: 900;">
              <span>🚀 BẮT ĐẦU GIẢI ĐẤU</span>
            </button>
          </div>
        </div>
      `;
    }
  }

  private renderManageTab(): string {
    if (this.teams.length === 0) {
      return `
        <div class="t1-card empty-state">
          <div class="empty-icon">📂</div>
          <div class="empty-title">Chưa có đội nào để chỉnh sửa</div>
          <div class="empty-desc">Hãy bấm "🚀 BẮT ĐẦU GIẢI ĐẤU" và sang Tab 2 để tạo đội trước.</div>
        </div>
      `;
    }

    return this.teams.map((team, idx) => {
      const details = (team.memberDetails && team.memberDetails.length > 0)
        ? team.memberDetails
        : (team.members || [team.member1, team.member2].filter(Boolean)).map((m) => ({ name: m, stk: '' }));

      const membersHtml = details.map((m, mIdx) => {
        return `
          <div class="dynamic-member-row" style="margin-bottom: 8px;">
            <div class="member-input-badge">#${mIdx + 1}</div>
            <div class="member-name-flex">
              <input
                type="text"
                class="t1-input manage-member-name"
                data-team-id="${team.id}"
                data-member-idx="${mIdx}"
                placeholder="Tên thành viên..."
                value="${m.name}"
              />
            </div>
            <div class="member-stk-flex">
              <input
                type="text"
                class="t1-input stk-input manage-member-stk"
                data-team-id="${team.id}"
                data-member-idx="${mIdx}"
                placeholder="STK 6 số"
                maxlength="6"
                pattern="[0-9]*"
                value="${m.stk || ''}"
              />
            </div>
            <button
              type="button"
              class="btn-remove-member btn-delete-single-member"
              data-team-id="${team.id}"
              data-member-idx="${mIdx}"
              title="Xóa thành viên này"
            >✕</button>
          </div>
        `;
      }).join('');

      return `
        <div class="team-manage-card" data-card-team-id="${team.id}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="avatar-circle avatar-active" style="width: 28px; height: 28px; font-size: 13px;">${idx + 1}</span>
              <input
                type="text"
                class="t1-input manage-team-name-input"
                data-team-id="${team.id}"
                value="${team.name}"
                placeholder="Tên đội..."
                style="font-size: 16px; font-weight: 850; max-width: 260px;"
              />
              ${team.customName ? '<span class="t1-pill t1-pill-warning">Tự đặt</span>' : '<span class="t1-pill t1-pill-cyan">Mặc định</span>'}
            </div>

            <div style="display: flex; gap: 8px;">
              <button
                type="button"
                class="t1-btn t1-btn-primary btn-add-member-to-card"
                data-team-id="${team.id}"
                style="padding: 6px 14px; font-size: 12px;"
              >
                <span>＋ Thêm Thành Viên</span>
              </button>
              <button
                type="button"
                class="t1-btn t1-btn-success btn-save-card-team"
                data-team-id="${team.id}"
                style="padding: 6px 16px; font-size: 12px;"
              >
                <span>💾 Lưu Thay Đổi</span>
              </button>
              <button
                type="button"
                class="t1-btn t1-btn-danger btn-delete-team"
                data-id="${team.id}"
                data-name="${team.name}"
                style="padding: 6px 12px; font-size: 12px;"
                title="Xóa toàn bộ đội này"
              >
                🗑️ Xóa Đội
              </button>
            </div>
          </div>

          <div style="background: #f8fafc; padding: 14px 16px; border-radius: 14px; border: 1px solid #e2e8f0;">
            <div style="font-size: 11.5px; font-weight: 850; color: #64748b; margin-bottom: 10px; text-transform: uppercase;">
              Thành viên trong đội (${details.length} người) & STK (tối đa 6 số):
            </div>
            <div class="manage-members-list" data-team-id="${team.id}">
              ${membersHtml || '<div style="color: #94a3b8; font-size: 13px; font-weight: 600;">Đội chưa có thành viên nào. Bấm nút "＋ Thêm Thành Viên" ở trên để nhập.</div>'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  private switchTab(tab: ActiveTab): void {
    if (tab === 'create' && !this.tournamentState.isActive) {
      Toast.warning('Bạn cần bấm "Bắt Đầu Giải Đấu" trước khi tạo và nhập đội!');
    }

    this.currentTab = tab;
    const tabListNav = document.getElementById('tab-nav-list');
    const tabCreateNav = document.getElementById('tab-nav-create');
    const tabManageNav = document.getElementById('tab-nav-manage');
    const tabIgStkNav = document.getElementById('tab-nav-igstk');

    const contentList = document.getElementById('tab-content-list');
    const contentCreate = document.getElementById('tab-content-create');
    const contentManage = document.getElementById('tab-content-manage');
    const contentIgStk = document.getElementById('tab-content-igstk');

    [tabListNav, tabCreateNav, tabManageNav, tabIgStkNav].forEach((btn) => btn?.classList.remove('active'));
    [contentList, contentCreate, contentManage, contentIgStk].forEach((el) => {
      if (el) el.style.display = 'none';
    });

    if (tab === 'list') {
      tabListNav?.classList.add('active');
      if (contentList) contentList.style.display = 'block';
      this.updateUI();
    } else if (tab === 'create') {
      tabCreateNav?.classList.add('active');
      if (contentCreate) {
        contentCreate.innerHTML = this.renderCreateTabContent();
        contentCreate.style.display = 'block';
        this.bindCreateTabEvents();
        if (this.tournamentState.isActive) {
          this.initTabCreateForm();
        }
      }
      this.updateCreateTabHint();
    } else if (tab === 'manage') {
      tabManageNav?.classList.add('active');
      if (contentManage) contentManage.style.display = 'block';
      this.updateManageTab();
    } else if (tab === 'igstk') {
      tabIgStkNav?.classList.add('active');
      if (contentIgStk) contentIgStk.style.display = 'block';
      this.updateIgStkTab();
    }
  }

  private updateCreateTabHint(): void {
    const nextNum = apiService.findNextDefaultNumber(this.teams);
    const hint = document.getElementById('tab-team-name-hint');
    const input = document.getElementById('tab-input-team-name') as HTMLInputElement;
    if (hint) {
      hint.innerHTML = `💡 Để trống ô này: Hệ thống tự động đặt tên là <strong>Đội ${nextNum}</strong>`;
    }
    if (input) {
      input.placeholder = `Để trống sẽ tự động lấy: Đội ${nextNum}`;
    }
    const navBtn = document.getElementById('tab-nav-create');
    if (navBtn) {
      const lockIcon = this.tournamentState.isActive ? `(Đội ${nextNum})` : '🔒';
      navBtn.innerHTML = `<span>➕</span> <span>Tab 2: Tạo Đội Mới ${lockIcon}</span>`;
    }
  }

  private async startTournamentAction(): Promise<void> {
    this.tournamentState = {
      isActive: true,
      mode: this.tournamentMode,
      startedAt: Date.now(),
    };

    // Khởi tạo trạng thái Đợt 1 cho giải đấu
    this.waveState = {
      currentWave: 1,
      teamStatus: {},
      activeTeamIds: this.teams.map((t) => t.id),
      eliminatedTeams: [],
      updatedAt: Date.now(),
    };

    try {
      await apiService.setTournamentState(this.tournamentState);
      await apiService.setWaveAttendanceState(this.waveState);
      Toast.success(`🚀 ĐÃ BẮT ĐẦU GIẢI ĐẤU THỂ THỨC ${this.tournamentMode.toUpperCase()} (ĐỢT 1)! BÂY GIỜ BẠN CÓ THỂ NHẬP ĐỘI.`);
      this.updateTournamentBanner();
      this.syncModeButtonsUI();
      this.updateUI();
      this.switchTab('create');
    } catch (err) {
      Toast.error(`Không thể bắt đầu: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async setTournamentMode(mode: TournamentMode): Promise<void> {
    if (this.tournamentState.isActive) {
      Toast.warning('🔒 Giải đấu đang diễn ra! Không được đổi thể thức nữa. Hãy bấm kết thúc giải với mã PIN 2000 để bắt đầu giải mới.');
      return;
    }

    this.tournamentMode = mode;
    this.tournamentState.mode = mode;

    this.syncModeButtonsUI();

    // Cập nhật trạng thái thể thức lên Firebase RTDB
    await apiService.setTournamentState(this.tournamentState);
    this.updateTournamentBanner();

    // Nếu đang ở Tab 2, tự động re-init lại đúng số ô theo thể thức vừa chọn
    if (this.currentTab === 'create') {
      const createContent = document.getElementById('tab-content-create');
      if (createContent) {
        createContent.innerHTML = this.renderCreateTabContent();
        this.bindCreateTabEvents();
        this.initTabCreateForm();
      }
    }

    const cap = this.getTargetCapacity();
    Toast.success(`⚡ Đã chuyển sang thể thức ${mode.toUpperCase()} (Tự tạo sẵn ${cap > 0 ? `${cap} ô` : 'tự do'})`);
    this.updateUI();
  }

  private updateTournamentBanner(): void {
    const wrapper = document.getElementById('tournament-banner-wrapper');
    if (wrapper) {
      wrapper.innerHTML = this.renderTournamentBanner();
      this.bindBannerEvents();
    }
    const createContent = document.getElementById('tab-content-create');
    if (createContent && this.currentTab === 'create') {
      createContent.innerHTML = this.renderCreateTabContent();
      this.bindCreateTabEvents();
      if (this.tournamentState.isActive) {
        this.initTabCreateForm();
      }
    }
    this.updateCreateTabHint();
  }

  // Tự động tạo đúng số ô nhập theo thể thức (3v3 thì 3 ô, 4v4 thì 4 ô, 5v5 thì 5 ô, 10v10 thì 10 ô)
  private initTabCreateForm(): void {
    const container = document.getElementById('tab-member-inputs-container');
    if (!container) return;
    container.innerHTML = '';
    
    const count = this.getTargetCapacity();
    const rowsToCreate = count > 0 ? count : 3;

    for (let i = 0; i < rowsToCreate; i++) {
      this.addTabMemberField('', '');
    }
  }

  private addTabMemberField(valName = '', valStk = ''): void {
    const container = document.getElementById('tab-member-inputs-container');
    if (!container) return;
    const currentRows = container.querySelectorAll('.dynamic-member-row');
    if (currentRows.length >= 30) {
      Toast.warning('Mỗi đội tối đa 30 thành viên!');
      return;
    }

    const idx = currentRows.length + 1;
    const row = document.createElement('div');
    row.className = 'dynamic-member-row';
    row.innerHTML = `
      <div class="member-input-badge">#${idx}</div>
      <div class="member-name-flex" style="position: relative;">
        <input
          type="text"
          class="t1-input tab-member-name-input"
          placeholder="Tên thành viên ${idx} (Gõ chữ cái để tìm nhanh)..."
          maxlength="50"
          value="${valName}"
          autocomplete="off"
        />
        <div class="t1-autocomplete-dropdown tab-member-dropdown" style="display: none;"></div>
      </div>
      <div class="member-stk-flex">
        <input
          type="text"
          class="t1-input stk-input tab-member-stk-input"
          placeholder="STK (6 số)"
          maxlength="6"
          pattern="[0-9]*"
          value="${valStk}"
          title="STK gồm tối đa 6 chữ số"
        />
      </div>
      <button type="button" class="btn-remove-member" title="Xóa ô nhập này">✕</button>
    `;

    const nameInput = row.querySelector('.tab-member-name-input') as HTMLInputElement;
    const stkInput = row.querySelector('.tab-member-stk-input') as HTMLInputElement;
    const dropdown = row.querySelector('.tab-member-dropdown') as HTMLElement;

    if (nameInput && stkInput && dropdown) {
      this.setupMemberAutocomplete(nameInput, stkInput, dropdown);
    }

    stkInput?.addEventListener('input', () => {
      stkInput.value = stkInput.value.replace(/\D/g, '').slice(0, 6);
    });

    const removeBtn = row.querySelector('.btn-remove-member');
    removeBtn?.addEventListener('click', () => {
      row.remove();
      this.reindexTabMemberFields();
    });

    container.appendChild(row);
  }

  private getAvailableMembers(): { name: string; stk: string }[] {
    const map = new Map<string, string>();

    // 1. Dữ liệu từ Tab 4 (Danh sách IG - STK từ Discord)
    for (const m of this.igStkMembers) {
      if (m.ig && m.ig.trim()) {
        map.set(m.ig.trim(), m.stk?.trim() || '');
      }
    }

    // 2. Dữ liệu từ Tab 1 (Các đội & thành viên đã có trong giải)
    for (const t of this.teams) {
      if (t.memberDetails) {
        for (const md of t.memberDetails) {
          if (md.name && md.name.trim() && !map.has(md.name.trim())) {
            map.set(md.name.trim(), md.stk?.trim() || '');
          }
        }
      }
      if (t.members) {
        for (const m of t.members) {
          if (m && m.trim() && !map.has(m.trim())) {
            map.set(m.trim(), '');
          }
        }
      }
    }

    const list: { name: string; stk: string }[] = [];
    map.forEach((stk, name) => {
      list.push({ name, stk });
    });
    return list;
  }

  private setupMemberAutocomplete(
    nameInput: HTMLInputElement,
    stkInput: HTMLInputElement | null,
    dropdown: HTMLElement
  ): void {
    let activeIndex = -1;

    const hideDropdown = () => {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      activeIndex = -1;
    };

    const selectItem = (item: { name: string; stk: string }) => {
      nameInput.value = item.name;
      if (stkInput && item.stk) {
        stkInput.value = item.stk.slice(0, 6);
      }
      hideDropdown();

      // Hiệu ứng viền xanh thông minh báo hiệu đã tự động khớp
      nameInput.style.borderColor = '#10b981';
      nameInput.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
      if (stkInput) {
        stkInput.style.borderColor = '#10b981';
        stkInput.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
      }
      setTimeout(() => {
        nameInput.style.borderColor = '';
        nameInput.style.boxShadow = '';
        if (stkInput) {
          stkInput.style.borderColor = '';
          stkInput.style.boxShadow = '';
        }
      }, 1000);
    };

    nameInput.addEventListener('input', () => {
      const rawVal = nameInput.value.trim();
      if (!rawVal) {
        hideDropdown();
        return;
      }

      const q = this.removeVietnameseTones(rawVal);
      const pool = this.getAvailableMembers();

      // Tìm kiếm thông minh: không phân biệt hoa thường, hỗ trợ có dấu và không dấu
      const matches = pool.filter((item) => {
        const norm = this.removeVietnameseTones(item.name);
        // Khớp đầu từ, khớp ký tự đầu các từ (viết tắt), hoặc khớp chuỗi
        return (
          norm.startsWith(q) ||
          norm.split(/\s+/).some((w) => w.startsWith(q)) ||
          norm.includes(q)
        );
      });

      // Sắp xếp ưu tiên: khớp từ đầu > khớp từ trong tên > chứa chuỗi
      matches.sort((a, b) => {
        const na = this.removeVietnameseTones(a.name);
        const nb = this.removeVietnameseTones(b.name);
        const aStart = na.startsWith(q) ? 0 : 1;
        const bStart = nb.startsWith(q) ? 0 : 1;
        if (aStart !== bStart) return aStart - bStart;
        return a.name.localeCompare(b.name);
      });

      // Tự động nhận diện và chọn nếu chỉ có duy nhất 1 kết quả khớp chính xác:
      // Ví dụ: Gõ 't' -> nhiều kết quả; gõ tiếp 'r' -> 'Trí', 'Trung'; gõ 'tri' -> chỉ còn 'Trí' -> Tự chọn Trí và điền STK!
      if (q.length >= 2 && matches.length === 1) {
        const single = matches[0];
        const singleNorm = this.removeVietnameseTones(single.name);
        if (singleNorm.startsWith(q) || singleNorm === q) {
          selectItem(single);
          return;
        }
      }

      if (matches.length === 0) {
        hideDropdown();
        return;
      }

      // Hiển thị danh sách gợi ý (tối đa 8 mục)
      const topMatches = matches.slice(0, 8);
      dropdown.innerHTML = topMatches
        .map((item, idx) => `
          <div class="t1-autocomplete-item" data-idx="${idx}">
            <div style="font-size: 13.5px; font-weight: 800; color: #1e293b;">
              👤 ${item.name}
            </div>
            ${item.stk ? `<span class="stk-pill" style="font-size: 11px; padding: 2px 8px;">STK: ${item.stk}</span>` : '<span style="font-size: 11px; color: #94a3b8; font-weight: 600;">Chưa có STK</span>'}
          </div>
        `)
        .join('');

      dropdown.style.display = 'block';

      const items = dropdown.querySelectorAll('.t1-autocomplete-item');
      items.forEach((el) => {
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
          selectItem(topMatches[idx]);
        });
      });
    });

    nameInput.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.t1-autocomplete-item');
      if (dropdown.style.display === 'none' || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        this.updateActiveAutocompleteItem(items, activeIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        this.updateActiveAutocompleteItem(items, activeIndex);
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && activeIndex < items.length) {
          e.preventDefault();
          (items[activeIndex] as HTMLElement).dispatchEvent(new MouseEvent('mousedown'));
        }
      } else if (e.key === 'Escape') {
        hideDropdown();
      }
    });

    nameInput.addEventListener('blur', () => {
      setTimeout(hideDropdown, 200);
    });
  }

  private updateActiveAutocompleteItem(items: NodeListOf<Element>, activeIndex: number): void {
    items.forEach((item, idx) => {
      if (idx === activeIndex) {
        item.classList.add('active');
        (item as HTMLElement).scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  private removeVietnameseTones(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  private reindexTabMemberFields(): void {
    const container = document.getElementById('tab-member-inputs-container');
    if (!container) return;
    const rows = container.querySelectorAll('.dynamic-member-row');
    rows.forEach((r, idx) => {
      const badge = r.querySelector('.member-input-badge');
      const input = r.querySelector('.tab-member-name-input') as HTMLInputElement;
      if (badge) badge.textContent = `#${idx + 1}`;
      if (input) input.placeholder = `Tên thành viên ${idx + 1}...`;
    });
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

    const waveToolbar = document.getElementById('wave-toolbar-container');
    if (waveToolbar) {
      waveToolbar.innerHTML = renderWaveToolbar(this.waveState, this.getActiveTeams().length, this.tournamentState.isActive);
      this.bindWaveEvents();
    }

    const tableContainer = document.getElementById('table-container');
    if (tableContainer) {
      tableContainer.innerHTML = renderTeamTable(
        this.filteredTeams(),
        this.isLoading,
        this.searchQuery,
        this.tournamentMode,
        this.waveState,
        this.tournamentState.isActive
      );
      this.bindTableButtons();
      this.bindWaveRowButtons();
    }

    const ssePill = document.getElementById('sse-status-pill');
    if (ssePill) {
      ssePill.className = `t1-pill ${this.isSseConnected ? 't1-pill-success' : 't1-pill-warning'}`;
      ssePill.textContent = this.isSseConnected ? '● Realtime Đang Bật' : '○ Đang Kết Nối Realtime...';
    }

    this.updateCreateTabHint();
    if (this.currentTab === 'manage') {
      this.updateManageTab();
    }
  }

  private bindWaveEvents(): void {
    // Tích tất cả V
    document.getElementById('btn-tick-all-v')?.addEventListener('click', async () => {
      if (!this.waveState) {
        this.waveState = {
          currentWave: 1,
          teamStatus: {},
          activeTeamIds: this.teams.map((t) => t.id),
          eliminatedTeams: [],
          updatedAt: Date.now(),
        };
      }
      const activeTeams = this.getActiveTeams();
      activeTeams.forEach((t) => {
        this.waveState!.teamStatus[t.id] = 'V';
      });
      this.waveState.updatedAt = Date.now();
      await apiService.setWaveAttendanceState(this.waveState);
      Toast.success(`✔️ Đã tích V (Đi tiếp) cho toàn bộ ${activeTeams.length} đội đang thi đấu!`);
      this.updateUI();
    });

    // Bỏ chọn tất cả
    document.getElementById('btn-untick-all')?.addEventListener('click', async () => {
      if (!this.waveState) return;
      const activeTeams = this.getActiveTeams();
      activeTeams.forEach((t) => {
        delete this.waveState!.teamStatus[t.id];
      });
      this.waveState.updatedAt = Date.now();
      await apiService.setWaveAttendanceState(this.waveState);
      Toast.info('🔄 Đã bỏ chọn tất cả trạng thái V / X ở đợt này.');
      this.updateUI();
    });

    // Xem danh sách đội đã bị loại
    document.getElementById('btn-view-eliminated')?.addEventListener('click', () => {
      const eliminated = this.waveState?.eliminatedTeams || [];
      this.eliminatedTeamsModal.open(eliminated);
    });

    // Nút kết thúc / đóng giải đấu khi đã có nhà vô địch
    document.getElementById('btn-end-tournament-champion')?.addEventListener('click', () => {
      this.confirmModal.open('kết thúc mùa giải này để làm mới hệ thống cho giải đấu tiếp theo', async () => {
        this.tournamentState = {
          isActive: false,
          mode: this.tournamentMode,
          endedAt: Date.now(),
        };
        this.waveState = null;
        await apiService.setTournamentState(this.tournamentState);
        await apiService.setWaveAttendanceState({
          currentWave: 1,
          teamStatus: {},
          activeTeamIds: this.teams.map((t) => t.id),
          eliminatedTeams: [],
          updatedAt: Date.now(),
        });
        Toast.success('🏁 Đã đóng mùa giải thành công! Sẵn sàng cho giải đấu tiếp theo.');
        this.updateTournamentBanner();
        this.syncModeButtonsUI();
        this.updateUI();
      });
    });

    // Nút Hoàn tất đợt (Chốt đợt & tự động loại đội X)
    document.getElementById('btn-complete-wave')?.addEventListener('click', () => {
      const currentWave = this.waveState ? this.waveState.currentWave : 1;
      const activeTeams = this.getActiveTeams();

      if (activeTeams.length === 0) {
        Toast.warning('Hiện không còn đội nào đang thi đấu trong giải!');
        return;
      }

      const statusMap = this.waveState?.teamStatus || {};
      const xTeams = activeTeams.filter((t) => statusMap[t.id] === 'X');
      const vTeams = activeTeams.filter((t) => statusMap[t.id] === 'V');
      const unmarkedTeams = activeTeams.filter((t) => !statusMap[t.id] || statusMap[t.id] === 'none');

      let confirmDesc = `Chốt kết quả Đợt ${currentWave}: Loại ${xTeams.length} đội (X), Giữ lại ${vTeams.length} đội (V) để vào Đợt ${currentWave + 1}`;
      if (unmarkedTeams.length > 0) {
        confirmDesc += ` (Chú ý: Còn ${unmarkedTeams.length} đội chưa tích sẽ được giữ lại)`;
      }

      this.confirmModal.open(confirmDesc, async () => {
        try {
          if (!this.waveState) {
            this.waveState = {
              currentWave: 1,
              teamStatus: {},
              activeTeamIds: activeTeams.map((t) => t.id),
              eliminatedTeams: [],
              updatedAt: Date.now(),
            };
          }

          if (!this.waveState.eliminatedTeams) {
            this.waveState.eliminatedTeams = [];
          }

          // Chuyển các đội tích X vào danh sách đội bị loại
          for (const xt of xTeams) {
            const members = (xt.memberDetails && xt.memberDetails.length > 0)
              ? xt.memberDetails.map((m) => m.name)
              : (xt.members || [xt.member1, xt.member2].filter(Boolean));

            this.waveState.eliminatedTeams.push({
              id: xt.id,
              name: xt.name,
              members,
              eliminatedAtWave: currentWave,
              eliminatedAt: Date.now(),
            });
          }

          // Cập nhật danh sách đội còn sống
          const survivingTeams = activeTeams.filter((t) => statusMap[t.id] !== 'X');
          this.waveState.activeTeamIds = survivingTeams.map((t) => t.id);

          // Sang đợt mới và reset bảng tích
          this.waveState.currentWave = currentWave + 1;
          this.waveState.teamStatus = {};
          this.waveState.updatedAt = Date.now();

          // Kiểm tra nếu chỉ còn 1 đội -> Tìm ra nhà vô địch
          if (survivingTeams.length === 1) {
            this.waveState.championId = survivingTeams[0].id;
            this.waveState.championName = survivingTeams[0].name;
            Toast.success(`🏆 CHÚC MỪNG NHÀ VÔ ĐỊCH: "${survivingTeams[0].name}" ĐÃ CHIẾN THẮNG GIẢI ĐẤU!`);
          } else {
            Toast.success(`🎉 ĐÃ HOÀN TẤT ĐỢT ${currentWave}! Loại ${xTeams.length} đội, ${survivingTeams.length} đội chính thức bước vào ĐỢT ${this.waveState.currentWave}.`);
          }

          await apiService.setWaveAttendanceState(this.waveState);
          this.updateUI();
        } catch (err) {
          Toast.error(`Lỗi khi chốt đợt: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    });
  }

  private bindWaveRowButtons(): void {
    // Nút toggle V
    const vButtons = document.querySelectorAll('.btn-toggle-v');
    vButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const teamId = btn.getAttribute('data-team-id');
        if (!teamId) return;

        if (!this.waveState) {
          this.waveState = {
            currentWave: 1,
            teamStatus: {},
            activeTeamIds: this.teams.map((t) => t.id),
            eliminatedTeams: [],
            updatedAt: Date.now(),
          };
        }

        const currentVal = this.waveState.teamStatus[teamId] || 'none';
        this.waveState.teamStatus[teamId] = currentVal === 'V' ? 'none' : 'V';
        this.waveState.updatedAt = Date.now();

        await apiService.setWaveAttendanceState(this.waveState);
        this.updateUI();
      });
    });

    // Nút toggle X
    const xButtons = document.querySelectorAll('.btn-toggle-x');
    xButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const teamId = btn.getAttribute('data-team-id');
        if (!teamId) return;

        if (!this.waveState) {
          this.waveState = {
            currentWave: 1,
            teamStatus: {},
            activeTeamIds: this.teams.map((t) => t.id),
            eliminatedTeams: [],
            updatedAt: Date.now(),
          };
        }

        const currentVal = this.waveState.teamStatus[teamId] || 'none';
        this.waveState.teamStatus[teamId] = currentVal === 'X' ? 'none' : 'X';
        this.waveState.updatedAt = Date.now();

        await apiService.setWaveAttendanceState(this.waveState);
        this.updateUI();
      });
    });
  }

  private updateManageTab(): void {
    const container = document.getElementById('tab-manage-container');
    if (container) {
      container.innerHTML = this.renderManageTab();
      this.bindManageTabEvents();
    }
  }

  private updateIgStkTab(): void {
    const container = document.getElementById('tab-content-igstk');
    if (container) {
      container.innerHTML = renderIgStkTab(
        this.igStkMembers,
        this.parsedIgStkItems,
        this.igStkSearchQuery,
        this.selectedIgStkIds,
        this.skipDuplicates
      );
      this.bindIgStkEvents();
    }
  }

  private bindIgStkEvents(): void {
    const bulkTextarea = document.getElementById('textarea-bulk-input') as HTMLTextAreaElement;

    // Nút phân tích dữ liệu dán vào
    document.getElementById('btn-parse-data')?.addEventListener('click', () => {
      const val = bulkTextarea ? bulkTextarea.value : '';
      if (!val.trim()) {
        Toast.warning('Vui lòng dán nội dung danh sách IG và STK từ Discord vào khung trước khi phân tích!');
        return;
      }
      this.parsedIgStkItems = parseIgStkInput(val, this.igStkMembers);
      if (this.parsedIgStkItems.length === 0) {
        Toast.warning('Không tìm thấy dòng nào chứa định dạng IG và STK hợp lệ!');
      } else {
        const validCount = this.parsedIgStkItems.filter((p) => p.status === 'valid').length;
        Toast.success(`⚡ Đã phân tích ${this.parsedIgStkItems.length} dòng (Tìm thấy ${validCount} bản ghi hợp lệ)`);
      }
      this.updateIgStkTab();
    });

    // Nút xóa vùng nhập
    document.getElementById('btn-clear-bulk-input')?.addEventListener('click', () => {
      if (bulkTextarea) bulkTextarea.value = '';
      this.parsedIgStkItems = [];
      this.updateIgStkTab();
    });

    // Checkbox bỏ qua STK trùng
    const chkSkip = document.getElementById('chk-skip-duplicates') as HTMLInputElement;
    chkSkip?.addEventListener('change', () => {
      this.skipDuplicates = chkSkip.checked;
    });

    // Nút xác nhận thêm dữ liệu hợp lệ vào danh sách
    document.getElementById('btn-confirm-add-parsed')?.addEventListener('click', async () => {
      if (this.parsedIgStkItems.length === 0) return;

      const itemsToAdd = this.parsedIgStkItems.filter((p) => {
        if (this.skipDuplicates) {
          return p.status === 'valid';
        }
        return p.status === 'valid' || p.status.includes('duplicate');
      });

      if (itemsToAdd.length === 0) {
        Toast.warning('Không có bản ghi hợp lệ nào để thêm!');
        return;
      }

      const newMembers: IgStkMember[] = itemsToAdd.map((item) => ({
        id: crypto.randomUUID ? crypto.randomUUID() : `ig-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        ig: item.ig,
        stk: item.stk,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      try {
        await apiService.addIgStkMembers(newMembers);
        this.igStkMembers = await apiService.getIgStkMembers();
        this.parsedIgStkItems = [];
        if (bulkTextarea) bulkTextarea.value = '';
        Toast.success(`🎉 Đã thêm thành công ${newMembers.length} thành viên vào danh sách IG – STK!`);
        this.updateIgStkTab();
      } catch (err) {
        Toast.error(`Lỗi khi lưu dữ liệu: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    // Xuất file Excel (.csv UTF-8 chuẩn mở ngay bằng Excel)
    document.getElementById('btn-export-excel')?.addEventListener('click', () => {
      exportIgStkToExcel(this.igStkMembers);
      Toast.success('📊 Đang tải file danh sách Excel (.csv) về máy!');
    });

    // Tìm kiếm trong danh sách IG - STK
    const searchInp = document.getElementById('search-ig-stk-input') as HTMLInputElement;
    searchInp?.addEventListener('input', (e) => {
      this.igStkSearchQuery = (e.target as HTMLInputElement).value;
      this.updateIgStkTab();
      const newInp = document.getElementById('search-ig-stk-input') as HTMLInputElement;
      if (newInp) {
        newInp.focus();
        newInp.setSelectionRange(newInp.value.length, newInp.value.length);
      }
    });

    // Chọn tất cả
    const chkSelectAll = document.getElementById('chk-select-all') as HTMLInputElement;
    chkSelectAll?.addEventListener('change', () => {
      const q = this.igStkSearchQuery.trim().toLowerCase();
      const filtered = this.igStkMembers.filter((m) => !q || m.ig.toLowerCase().includes(q) || m.stk.toLowerCase().includes(q));

      if (chkSelectAll.checked) {
        filtered.forEach((m) => this.selectedIgStkIds.add(m.id));
      } else {
        filtered.forEach((m) => this.selectedIgStkIds.delete(m.id));
      }
      this.updateIgStkTab();
    });

    // Chọn từng thành viên
    const rowCheckboxes = document.querySelectorAll('.chk-select-member');
    rowCheckboxes.forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const id = (e.target as HTMLInputElement).getAttribute('data-id');
        if (!id) return;
        if ((e.target as HTMLInputElement).checked) {
          this.selectedIgStkIds.add(id);
        } else {
          this.selectedIgStkIds.delete(id);
        }
        this.updateIgStkTab();
      });
    });

    // Nút xóa các mục đã chọn (Bulk Delete)
    document.getElementById('btn-bulk-delete')?.addEventListener('click', () => {
      const count = this.selectedIgStkIds.size;
      if (count === 0) return;

      this.confirmModal.open(`${count} thành viên IG – STK đã chọn`, async () => {
        try {
          const ids = Array.from(this.selectedIgStkIds);
          await apiService.bulkDeleteIgStkMembers(ids);
          this.selectedIgStkIds.clear();
          this.igStkMembers = await apiService.getIgStkMembers();
          Toast.success(`Đã xóa thành công ${count} thành viên khỏi danh sách!`);
          this.updateIgStkTab();
        } catch (err) {
          Toast.error(`Lỗi khi xóa hàng loạt: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    });

    // Nút copy nhanh IG / STK
    const copyBtns = document.querySelectorAll('.btn-copy-text');
    copyBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-text') || '';
        if (text) {
          try {
            await navigator.clipboard.writeText(text);
            Toast.success(`📋 Đã sao chép: "${text}"`);
          } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            Toast.success(`📋 Đã sao chép: "${text}"`);
          }
        }
      });
    });

    // Sửa từng thành viên
    const editBtns = document.querySelectorAll('.btn-edit-ig-stk');
    editBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const ig = btn.getAttribute('data-ig') || '';
        const stk = btn.getAttribute('data-stk') || '';
        if (!id) return;

        this.igStkEditModal.open(ig, stk, async (newIg, newStk) => {
          await apiService.updateIgStkMember(id, newIg, newStk);
          this.igStkMembers = await apiService.getIgStkMembers();
          Toast.success(`Đã cập nhật thông tin cho "${newIg}"`);
          this.updateIgStkTab();
        });
      });
    });

    // Xóa từng thành viên
    const deleteBtns = document.querySelectorAll('.btn-delete-ig-stk');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const ig = btn.getAttribute('data-ig') || 'thành viên này';
        if (!id) return;

        this.confirmModal.open(`thành viên "${ig}" khỏi danh sách`, async () => {
          try {
            await apiService.deleteIgStkMember(id);
            this.selectedIgStkIds.delete(id);
            this.igStkMembers = await apiService.getIgStkMembers();
            Toast.success(`Đã xóa "${ig}" thành công!`);
            this.updateIgStkTab();
          } catch (err) {
            Toast.error(`Lỗi khi xóa: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
      });
    });
  }

  private getActiveTeams(): Team[] {
    if (!this.tournamentState.isActive || !this.waveState || !this.waveState.eliminatedTeams) {
      return this.teams;
    }
    const eliminatedSet = new Set(this.waveState.eliminatedTeams.map((e) => e.id));
    return this.teams.filter((t) => !eliminatedSet.has(t.id));
  }

  private filteredTeams(): Team[] {
    const pool = this.getActiveTeams();
    if (!this.searchQuery.trim()) {
      return pool;
    }
    const q = this.searchQuery.trim().toLowerCase();
    return pool.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.memberDetails && t.memberDetails.some((m) => m.name.toLowerCase().includes(q) || (m.stk && m.stk.includes(q)))) ||
        (t.members && t.members.some((m) => m.toLowerCase().includes(q))) ||
        t.member1.toLowerCase().includes(q) ||
        t.member2.toLowerCase().includes(q)
    );
  }

  private bindBannerEvents(): void {
    // Nút Bắt Đầu Giải Đấu
    document.getElementById('btn-start-tournament')?.addEventListener('click', async () => {
      await this.startTournamentAction();
    });

    // Nút Kết Thúc Giải Đấu (Mã PIN 2000)
    document.getElementById('btn-end-tournament')?.addEventListener('click', () => {
      this.pinModal.open(async () => {
        this.tournamentState = {
          isActive: false,
          mode: this.tournamentMode,
          endedAt: Date.now(),
        };
        await apiService.setTournamentState(this.tournamentState);
        Toast.success('✅ ĐÃ KẾT THÚC GIẢI ĐẤU THÀNH CÔNG VỚI MÃ PIN 2000!');
        this.updateTournamentBanner();
        this.syncModeButtonsUI();
      });
    });
  }

  private bindCreateTabEvents(): void {
    // Autocomplete thông minh cho ô Tên Đội
    const teamNameInput = document.getElementById('tab-input-team-name') as HTMLInputElement;
    const teamDropdown = document.getElementById('tab-team-name-dropdown') as HTMLElement;
    if (teamNameInput && teamDropdown) {
      this.setupMemberAutocomplete(teamNameInput, null, teamDropdown);
    }

    // Nút bắt đầu từ bên trong Tab 2
    document.getElementById('btn-start-from-tab')?.addEventListener('click', async () => {
      await this.startTournamentAction();
    });

    // Thêm 1 ô nhập khi bấm nút cộng
    document.getElementById('tab-btn-add-member')?.addEventListener('click', () => {
      this.addTabMemberField('', '');
    });

    // Thêm nhanh theo thể thức
    document.getElementById('tab-btn-add-batch')?.addEventListener('click', () => {
      const cap = this.getTargetCapacity() > 0 ? this.getTargetCapacity() : 3;
      for (let i = 0; i < cap; i++) {
        this.addTabMemberField('', '');
      }
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
  }

  private bindDOMEvents(): void {
    this.bindBannerEvents();
    this.bindCreateTabEvents();

    // 4 Tabs
    document.getElementById('tab-nav-list')?.addEventListener('click', () => this.switchTab('list'));
    document.getElementById('tab-nav-create')?.addEventListener('click', () => this.switchTab('create'));
    document.getElementById('tab-nav-manage')?.addEventListener('click', () => this.switchTab('manage'));
    document.getElementById('tab-nav-igstk')?.addEventListener('click', () => this.switchTab('igstk'));

    // Thể thức
    const modeButtons = document.querySelectorAll('.btn-mode-toggle');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as TournamentMode;
        if (mode) this.setTournamentMode(mode);
      });
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
    this.bindWaveEvents();
    this.bindWaveRowButtons();
  }

  private bindManageTabEvents(): void {
    const stkInputs = document.querySelectorAll('.manage-member-stk');
    stkInputs.forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        target.value = target.value.replace(/\D/g, '').slice(0, 6);
      });
    });

    const addMemberBtns = document.querySelectorAll('.btn-add-member-to-card');
    addMemberBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const teamId = btn.getAttribute('data-team-id');
        const team = this.teams.find((t) => t.id === teamId);
        if (team) {
          if (!team.memberDetails) team.memberDetails = [];
          team.memberDetails.push({ name: '', stk: '' });
          this.updateManageTab();
        }
      });
    });

    const delMemberBtns = document.querySelectorAll('.btn-delete-single-member');
    delMemberBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const teamId = btn.getAttribute('data-team-id');
        const memberIdx = parseInt(btn.getAttribute('data-member-idx') || '-1', 10);
        const team = this.teams.find((t) => t.id === teamId);
        if (team && team.memberDetails && memberIdx >= 0) {
          team.memberDetails.splice(memberIdx, 1);
          this.updateManageTab();
        }
      });
    });

    const saveCardBtns = document.querySelectorAll('.btn-save-card-team');
    saveCardBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const teamId = btn.getAttribute('data-team-id');
        if (!teamId) return;

        const card = document.querySelector(`[data-card-team-id="${teamId}"]`);
        if (!card) return;

        const nameInput = card.querySelector('.manage-team-name-input') as HTMLInputElement;
        const name = nameInput ? nameInput.value.trim() : '';

        const memberRows = card.querySelectorAll('.dynamic-member-row');
        const memberDetails: MemberItem[] = [];

        memberRows.forEach((row) => {
          const mNameInp = row.querySelector('.manage-member-name') as HTMLInputElement;
          const mStkInp = row.querySelector('.manage-member-stk') as HTMLInputElement;
          const mName = mNameInp ? mNameInp.value.trim() : '';
          const mStk = mStkInp ? mStkInp.value.trim().slice(0, 6) : '';
          if (mName) {
            memberDetails.push({ name: mName, stk: mStk });
          }
        });

        const saveButton = btn as HTMLButtonElement;
        saveButton.disabled = true;
        saveButton.innerHTML = '<span>Đang lưu...</span>';

        try {
          const dto: UpdateTeamDto = {
            name: name || undefined,
            memberDetails,
            members: memberDetails.map((m) => m.name),
          };
          await this.handleUpdateTeam(teamId, dto);
          Toast.success(`Đã lưu thay đổi cho "${name || 'đội'}"`);
        } catch (err) {
          Toast.error(`Lỗi cập nhật: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          saveButton.disabled = false;
          saveButton.innerHTML = '<span>💾 Lưu Thay Đổi</span>';
        }
      });
    });

    const deleteBtns = document.querySelectorAll('.team-manage-card .btn-delete-team');
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

  private async handleTabCreateSubmit(): Promise<void> {
    const nameInp = document.getElementById('tab-input-team-name') as HTMLInputElement;
    const submitBtn = document.getElementById('tab-btn-submit-team') as HTMLButtonElement;
    const errBox = document.getElementById('tab-create-error') as HTMLElement;
    const container = document.getElementById('tab-member-inputs-container');

    const rows = container?.querySelectorAll('.dynamic-member-row');
    const memberDetails: MemberItem[] = [];

    rows?.forEach((row) => {
      const nameField = row.querySelector('.tab-member-name-input') as HTMLInputElement;
      const stkField = row.querySelector('.tab-member-stk-input') as HTMLInputElement;
      const name = nameField ? nameField.value.trim() : '';
      const stk = stkField ? stkField.value.trim().slice(0, 6) : '';
      if (name) {
        memberDetails.push({ name, stk });
      }
    });

    const name = nameInp ? nameInp.value.trim() : '';

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Đang lưu...</span>';
    errBox.style.display = 'none';

    try {
      const dto: CreateTeamDto = {
        name: name || undefined,
        members: memberDetails.map((m) => m.name),
        memberDetails,
      };
      await this.handleCreateTeam(dto);

      if (nameInp) nameInp.value = '';
      this.initTabCreateForm();
      this.switchTab('list');
    } catch (err) {
      errBox.textContent = err instanceof Error ? err.message : String(err);
      errBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>💾 Lưu Đội & Xuất Trận</span>';
    }
  }

  private bindTableButtons(): void {
    const editBtns = document.querySelectorAll('#table-container .btn-edit-team');
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

    const deleteBtns = document.querySelectorAll('#table-container .btn-delete-team');
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
