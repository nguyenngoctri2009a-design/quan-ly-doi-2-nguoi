export interface KpiData {
  totalTeams: number;
  totalMembers: number;
  fullTeams: number;
}

export function renderKpiCards(data: KpiData): string {
  const capacityPercent = data.totalTeams > 0
    ? Math.round((data.totalMembers / (data.totalTeams * 2)) * 100)
    : 0;

  return `
    <div class="kpi-grid">
      <div class="t1-kpi-card">
        <div class="t1-kpi-title">
          <span>🏆</span>
          <span>TỔNG SỐ ĐỘI</span>
        </div>
        <div class="t1-kpi-number" id="kpi-total-teams">${data.totalTeams}</div>
        <div class="t1-kpi-sub">Đang hoạt động trong giải</div>
      </div>

      <div class="t1-kpi-card">
        <div class="t1-kpi-title">
          <span>👥</span>
          <span>THÀNH VIÊN ĐÃ NHẬP</span>
        </div>
        <div class="t1-kpi-number" id="kpi-total-members">${data.totalMembers}</div>
        <div class="t1-kpi-sub">Tỉ lệ lấp đầy slot: <strong style="color: var(--t1-primary);">${capacityPercent}%</strong></div>
      </div>

      <div class="t1-kpi-card">
        <div class="t1-kpi-title">
          <span>⚡</span>
          <span>ĐỘI ĐỦ 2 NGƯỜI</span>
        </div>
        <div class="t1-kpi-number" id="kpi-full-teams" style="color: var(--t1-success);">${data.fullTeams}</div>
        <div class="t1-kpi-sub">Sẵn sàng thi đấu ngay</div>
      </div>
    </div>
  `;
}
