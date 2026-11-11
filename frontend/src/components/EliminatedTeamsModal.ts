import type { EliminatedTeamRecord } from '../types/team';

export class EliminatedTeamsModal {
  private overlay: HTMLElement | null = null;

  constructor() {
    this.createModalDOM();
  }

  private createModalDOM(): void {
    const existing = document.getElementById('eliminated-teams-modal-overlay');
    if (existing) existing.remove();

    this.overlay = document.createElement('div');
    this.overlay.id = 'eliminated-teams-modal-overlay';
    this.overlay.className = 't1-modal-overlay';
    this.overlay.style.display = 'none';

    this.overlay.innerHTML = `
      <div class="t1-modal-card" style="max-width: 620px; width: 92%; max-height: 85vh; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 26px;">❌</span>
            <div>
              <h3 style="margin: 0; font-size: 19px; font-weight: 900; color: #991b1b;">
                Danh Sách Đội Đã Bị Loại
              </h3>
              <div style="font-size: 12.5px; color: #64748b; font-weight: 600;" id="eliminated-modal-sub">
                Lịch sử các đội đã dừng bước qua các đợt đấu
              </div>
            </div>
          </div>
          <button type="button" class="btn-close-modal" id="btn-close-eliminated-modal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #94a3b8;">✕</button>
        </div>

        <div id="eliminated-teams-list-container" style="flex: 1; overflow-y: auto; padding-right: 4px;">
          <!-- Danh sách render tại đây -->
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 18px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          <button type="button" class="t1-btn t1-btn-secondary" id="btn-dismiss-eliminated-modal" style="padding: 9px 22px;">
            Đóng
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    const closeBtn = document.getElementById('btn-close-eliminated-modal');
    const dismissBtn = document.getElementById('btn-dismiss-eliminated-modal');

    closeBtn?.addEventListener('click', () => this.close());
    dismissBtn?.addEventListener('click', () => this.close());
  }

  public open(eliminatedTeams: EliminatedTeamRecord[]): void {
    const container = document.getElementById('eliminated-teams-list-container');
    const sub = document.getElementById('eliminated-modal-sub');

    if (sub) {
      sub.textContent = `Tổng cộng có ${eliminatedTeams.length} đội đã dừng bước qua các đợt đấu`;
    }

    if (container) {
      if (eliminatedTeams.length === 0) {
        container.innerHTML = `
          <div style="padding: 36px 16px; text-align: center; color: #64748b;">
            <div style="font-size: 42px; margin-bottom: 8px;">🛡️</div>
            <div style="font-size: 15px; font-weight: 800; color: var(--t1-text);">Chưa có đội nào bị loại!</div>
            <div style="font-size: 13px; margin-top: 4px;">Tất cả các đội vẫn đang tiếp tục thi đấu trong giải.</div>
          </div>
        `;
      } else {
        const rows = eliminatedTeams.map((t, idx) => {
          const dateStr = t.eliminatedAt ? new Date(t.eliminatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
          const membersStr = t.members && t.members.length > 0 ? t.members.join(', ') : 'Chưa cập nhật';

          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; margin-bottom: 8px; border-radius: 12px; background: #fef2f2; border: 1px solid #fecaca; flex-wrap: wrap; gap: 8px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 12px; font-weight: 800; color: #dc2626;">#${idx + 1}</span>
                  <strong style="font-size: 15px; color: #991b1b;">${t.name}</strong>
                  <span class="t1-pill t1-pill-danger" style="font-size: 11px; padding: 2px 8px;">
                    ❌ Bị loại ở Đợt ${t.eliminatedAtWave}
                  </span>
                </div>
                <div style="font-size: 12.5px; color: #7f1d1d; margin-top: 4px; opacity: 0.85;">
                  Thành viên: ${membersStr}
                </div>
              </div>
              <div style="font-size: 12px; color: #991b1b; font-weight: 600;">
                ${dateStr ? `Lúc: ${dateStr}` : ''}
              </div>
            </div>
          `;
        }).join('');

        container.innerHTML = rows;
      }
    }

    if (this.overlay) {
      this.overlay.style.display = 'flex';
    }
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }
}
