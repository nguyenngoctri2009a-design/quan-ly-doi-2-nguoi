import type { WaveAttendanceState } from '../types/team';

export function renderWaveToolbar(
  waveState: WaveAttendanceState | null,
  activeTeamsCount: number,
  isTournamentActive: boolean
): string {
  if (!isTournamentActive) {
    return '';
  }

  const currentWave = waveState ? waveState.currentWave : 1;
  const statusMap = waveState?.teamStatus || {};
  let vCount = 0;
  let xCount = 0;

  for (const val of Object.values(statusMap)) {
    if (val === 'V') vCount++;
    if (val === 'X') xCount++;
  }

  const eliminatedCount = waveState?.eliminatedTeams?.length || 0;

  return `
    <div class="t1-card" style="padding: 18px 24px; margin-bottom: 20px; background: #ffffff; border: 1.5px solid #bae6fd; box-shadow: 0 4px 18px rgba(14, 165, 233, 0.08);">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <!-- Thông tin Đợt -->
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; padding: 10px 18px; border-radius: 14px; font-weight: 950; font-size: 16px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3); letter-spacing: 0.5px;">
            ⚡ ĐỢT ${currentWave}
          </div>
          <div>
            <div style="font-size: 15px; font-weight: 900; color: var(--t1-text);">
              Điểm Danh & Tự Động Loại Đội — Đợt ${currentWave}
            </div>
            <div style="font-size: 12.5px; color: #64748b; font-weight: 600; margin-top: 3px;">
              Đang thi đấu: <strong style="color: var(--t1-primary);">${activeTeamsCount}</strong> đội • 
              Tích V (Đi tiếp): <strong style="color: #059669;">${vCount}</strong> • 
              Tích X (Loại): <strong style="color: #dc2626;">${xCount}</strong>
              ${eliminatedCount > 0 ? ` • Đã loại: <strong style="color: #991b1b;">${eliminatedCount}</strong> đội` : ''}
            </div>
          </div>
        </div>

        <!-- Hàng nút thao tác nhanh -->
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="t1-btn t1-btn-success" id="btn-tick-all-v" style="padding: 8px 16px; font-size: 12.5px; font-weight: 900;" title="Gán tất cả các đội còn lại là V (Đủ điều kiện đi tiếp)">
            <span>✔️ TÍCH TẤT CẢ V</span>
          </button>
          <button type="button" class="t1-btn t1-btn-secondary" id="btn-untick-all" style="padding: 8px 14px; font-size: 12.5px; font-weight: 800;" title="Bỏ chọn toàn bộ V/X ở đợt này">
            <span>🔄 BỎ CHỌN TẤT CẢ</span>
          </button>
          <button type="button" class="t1-btn t1-btn-primary" id="btn-complete-wave" style="padding: 9px 20px; font-size: 13.5px; font-weight: 950; box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);">
            <span>🚀 HOÀN TẤT ĐỢT ${currentWave}</span>
          </button>
          ${eliminatedCount > 0 ? `
            <button type="button" class="t1-btn t1-btn-secondary" id="btn-view-eliminated" style="padding: 8px 14px; font-size: 12.5px; font-weight: 800; border-color: #fca5a5; color: #991b1b;">
              <span>❌ XEM ĐỘI ĐÃ BỊ LOẠI (${eliminatedCount})</span>
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}
