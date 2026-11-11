export interface KpiData {
  totalTeams: number;
  totalMembers: number;
  fullTeams: number;
  targetPerTeam: number;
  advancedTeams?: number;
  currentRoundName?: string;
}

export function renderKpiCards(data: KpiData): string {
  const roundDisplay = data.currentRoundName || 'Chờ Khởi Đấu';
  const advancedCount = data.advancedTeams !== undefined ? data.advancedTeams : data.fullTeams;
  const advancedLabel = data.advancedTeams !== undefined ? 'ĐÃ VÀO VÒNG TRONG' : (data.targetPerTeam > 0 ? `ĐỘI ĐỦ ${data.targetPerTeam} NGƯỜI` : 'ĐỘI ĐỦ NGƯỜI');

  return `
    <div class="kpi-grid">
      <div class="t1-kpi-card">
        <div class="t1-kpi-title">
          <span>🏆</span>
          <span>TỔNG SỐ ĐỘI</span>
        </div>
        <div class="t1-kpi-number" id="kpi-total-teams">${data.totalTeams}</div>
        <div class="t1-kpi-sub">Đang tham gia giải</div>
      </div>

      <div class="t1-kpi-card">
        <div class="t1-kpi-title">
          <span>🔥</span>
          <span>${advancedLabel}</span>
        </div>
        <div class="t1-kpi-number" id="kpi-total-members" style="color: var(--t1-success);">${advancedCount}</div>
        <div class="t1-kpi-sub">${data.advancedTeams !== undefined ? 'Đội xuất sắc qua vòng' : 'Sẵn sàng thi đấu'}</div>
      </div>

      <div class="t1-kpi-card">
        <div class="t1-kpi-title">
          <span>⚔️</span>
          <span>GIAI ĐOẠN GIẢI</span>
        </div>
        <div class="t1-kpi-number" id="kpi-full-teams" style="color: var(--t1-primary); font-size: 20px; line-height: 1.3; font-weight: 900; margin-top: 4px;">
          ${roundDisplay}
        </div>
        <div class="t1-kpi-sub">Tiến độ loại trực tiếp</div>
      </div>
    </div>
  `;
}
