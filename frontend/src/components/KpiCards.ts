export interface KpiData {
  totalTeams: number;
  totalMembers: number;
  fullTeams: number;
  targetPerTeam: number;
}

export function renderKpiCards(data: KpiData): string {
  const targetLabel = data.targetPerTeam > 0 ? `ĐỘI ĐỦ ${data.targetPerTeam} NGƯỜI` : 'ĐỘI ĐÃ CÓ THÀNH VIÊN';

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
          <span>👥</span>
          <span>TỔNG SỐ TUYỂN THỦ</span>
        </div>
        <div class="t1-kpi-number" id="kpi-total-members" style="color: var(--t1-primary);">${data.totalMembers}</div>
        <div class="t1-kpi-sub">Tổng người chơi trong giải</div>
      </div>

      <div class="t1-kpi-card">
        <div class="t1-kpi-title">
          <span>⚡</span>
          <span>${targetLabel}</span>
        </div>
        <div class="t1-kpi-number" id="kpi-full-teams" style="color: var(--t1-success);">${data.fullTeams}</div>
        <div class="t1-kpi-sub">Sẵn sàng xuất trận</div>
      </div>
    </div>
  `;
}
