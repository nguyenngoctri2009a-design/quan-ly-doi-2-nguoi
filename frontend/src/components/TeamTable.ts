import type { Team, TournamentMode } from '../types/team';

export function renderTeamTable(
  teams: Team[],
  isLoading: boolean,
  searchQuery: string,
  mode: TournamentMode = '2v2'
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
          ${searchQuery ? `Không tìm thấy kết quả cho "${searchQuery}"` : 'Chưa có đội nào trong giải đấu'}
        </div>
        <div class="empty-desc">
          ${searchQuery ? 'Hãy thử tìm kiếm với từ khóa khác.' : 'Bấm sang tab "➕ Tạo Đội Mới" để đăng ký đội đầu tiên.'}
        </div>
      </div>
    `;
  }

  const expectedMembersMap: Record<TournamentMode, number> = {
    '1v1': 1,
    '2v2': 2,
    '3v3': 3,
    '4v4': 4,
    '5v5': 5,
    '10v10': 10,
    'custom': 0,
  };
  const targetCapacity = expectedMembersMap[mode];

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

      // Danh sách thành viên động (1, 2, 3, 4, 5, 10...)
      const members = (team.members && team.members.length > 0)
        ? team.members
        : [team.member1, team.member2].filter(Boolean);

      const memberChips = members.map((m, mIdx) => {
        const firstChar = m.trim().charAt(0).toUpperCase();
        return `
          <div class="member-chip" style="margin: 2px 4px 2px 0;">
            <div class="avatar-circle avatar-active" style="font-size: 10px; width: 20px; height: 20px;">
              ${firstChar || (mIdx + 1)}
            </div>
            <span style="font-weight: 700;">${m.trim()}</span>
          </div>
        `;
      }).join('');

      // Nút thêm nhanh người vào đội
      const quickAddBtn = `
        <button class="btn-quick-add-member btn-edit-team" data-id="${team.id}" style="margin: 2px 0; padding: 4px 10px; font-size: 11.5px;">
          <span>＋</span> <span>Thêm người</span>
        </button>
      `;

      // Status pill
      const memberCount = members.length;
      let statusPill = '';
      if (targetCapacity > 0) {
        if (memberCount >= targetCapacity) {
          statusPill = `<span class="t1-pill t1-pill-success">✓ Đủ ${memberCount}/${targetCapacity}</span>`;
        } else {
          statusPill = `<span class="t1-pill t1-pill-warning">⚡ ${memberCount}/${targetCapacity} người</span>`;
        }
      } else {
        statusPill = `<span class="t1-pill t1-pill-cyan">👥 ${memberCount} người</span>`;
      }

      return `
        <tr data-team-id="${team.id}">
          <td style="width: 50px; text-align: center; font-size: 16px;">${rankBadge}</td>
          <td style="min-width: 160px;">
            <div style="display: flex; align-items: center;">
              <strong style="color: var(--t1-text); font-size: 14.5px;">${team.name}</strong>
              ${customBadge}
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">ID: ${team.id.substring(0, 8)}...</div>
          </td>
          <td style="min-width: 280px;">
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px;">
              ${memberChips}
              ${quickAddBtn}
            </div>
          </td>
          <td style="width: 120px; white-space: nowrap;">${statusPill}</td>
          <td style="text-align: right; white-space: nowrap; width: 140px;">
            <button
              class="t1-btn t1-btn-gold btn-edit-team"
              data-id="${team.id}"
              style="padding: 6px 12px; font-size: 12px; margin-right: 6px;"
              title="Chỉnh sửa đội"
            >
              ✏️ Sửa
            </button>
            <button
              class="t1-btn t1-btn-danger btn-delete-team"
              data-id="${team.id}"
              data-name="${team.name}"
              style="padding: 6px 12px; font-size: 12px;"
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
            <th>DANH SÁCH THÀNH VIÊN</th>
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
