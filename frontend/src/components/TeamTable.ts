import type { Team } from '../types/team';

export function renderTeamTable(
  teams: Team[],
  isLoading: boolean,
  searchQuery: string
): string {
  if (isLoading) {
    return `
      <div class="t1-card" style="padding: 24px;">
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
      </div>
    `;
  }

  if (teams.length === 0) {
    return `
      <div class="t1-card empty-state">
        <div class="empty-icon">${searchQuery ? '🔍' : '📋'}</div>
        <div class="empty-title">
          ${searchQuery ? `Không tìm thấy kết quả cho "${searchQuery}"` : 'Chưa có đội nào trong danh sách'}
        </div>
        <div class="empty-desc">
          ${searchQuery ? 'Hãy thử tìm kiếm với từ khóa khác.' : 'Bấm sang tab "➕ Tạo Đội Mới" hoặc nút phía trên để thêm.'}
        </div>
      </div>
    `;
  }

  const rows = teams
    .map((team, index) => {
      const rank = index + 1;
      let rankBadge = `<span style="font-weight: 800; color: #64748b;">#${rank}</span>`;
      if (rank === 1) rankBadge = '🥇';
      else if (rank === 2) rankBadge = '🥈';
      else if (rank === 3) rankBadge = '🥉';

      const customBadge = team.customName
        ? `<span class="t1-pill t1-pill-warning" style="margin-left: 8px; font-size: 10.5px;">Tự đặt</span>`
        : `<span class="t1-pill t1-pill-cyan" style="margin-left: 8px; font-size: 10.5px;">Mặc định</span>`;

      const m1Html = team.member1.trim()
        ? `
          <div class="member-chip">
            <div class="avatar-circle avatar-active">${team.member1.trim().charAt(0).toUpperCase()}</div>
            <span>${team.member1.trim()}</span>
          </div>
        `
        : `
          <button class="btn-quick-add-member btn-slot-add" data-id="${team.id}" data-slot="1">
            <span>＋</span> <span>Thêm tên</span>
          </button>
        `;

      const m2Html = team.member2.trim()
        ? `
          <div class="member-chip">
            <div class="avatar-circle avatar-active">${team.member2.trim().charAt(0).toUpperCase()}</div>
            <span>${team.member2.trim()}</span>
          </div>
        `
        : `
          <button class="btn-quick-add-member btn-slot-add" data-id="${team.id}" data-slot="2">
            <span>＋</span> <span>Thêm tên</span>
          </button>
        `;

      const isFull = Boolean(team.member1.trim() && team.member2.trim());
      const statusPill = isFull
        ? `<span class="t1-pill t1-pill-success">✓ Đủ 2/2</span>`
        : `<span class="t1-pill t1-pill-warning">⚡ Khuyết slot</span>`;

      return `
        <tr data-team-id="${team.id}">
          <td style="width: 50px; text-align: center; font-size: 16px;">${rankBadge}</td>
          <td>
            <div style="display: flex; align-items: center;">
              <strong style="color: var(--t1-text); font-size: 14.5px;">${team.name}</strong>
              ${customBadge}
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">ID: ${team.id.substring(0, 8)}...</div>
          </td>
          <td>${m1Html}</td>
          <td>${m2Html}</td>
          <td>${statusPill}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button
              class="t1-btn t1-btn-gold btn-edit-team"
              data-id="${team.id}"
              style="padding: 6px 14px; font-size: 12px; margin-right: 6px;"
              title="Sửa thông tin đội"
            >
              ✏️ Sửa
            </button>
            <button
              class="t1-btn t1-btn-danger btn-delete-team"
              data-id="${team.id}"
              data-name="${team.name}"
              style="padding: 6px 14px; font-size: 12px;"
              title="Xóa đội"
            >
              🗑️ Xóa
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="t1-table-wrap">
      <table class="t1-table">
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">STT</th>
            <th>TÊN ĐỘI</th>
            <th>THÀNH VIÊN 1</th>
            <th>THÀNH VIÊN 2</th>
            <th>TRẠNG THÁI</th>
            <th style="text-align: right;">THAO TÁC</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}
