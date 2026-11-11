import type { BracketState, Team, TournamentMode } from '../types/team';

export function renderTeamTable(
  teams: Team[],
  isLoading: boolean,
  searchQuery: string,
  mode: TournamentMode = '2v2',
  bracketState: BracketState | null = null
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
          ${searchQuery ? 'Hãy thử tìm kiếm với từ khóa khác.' : 'Bấm sang tab "➕ Tạo Đội Mới" để tạo Đội 1, Đội 2...'}
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
      if (bracketState?.championId === team.id) {
        rankBadge = '👑';
      }

      const customBadge = team.customName
        ? `<span class="t1-pill t1-pill-warning" style="margin-left: 8px; font-size: 10.5px;">Tự đặt</span>`
        : `<span class="t1-pill t1-pill-cyan" style="margin-left: 8px; font-size: 10.5px;">Mặc định</span>`;

      // Danh sách thành viên kèm STK 6 số
      const memberDetails = (team.memberDetails && team.memberDetails.length > 0)
        ? team.memberDetails
        : (team.members || [team.member1, team.member2].filter(Boolean)).map((m) => ({ name: m, stk: '' }));

      const memberChips = memberDetails.map((m, mIdx) => {
        const firstChar = m.name.trim().charAt(0).toUpperCase();
        const stkBadge = m.stk?.trim()
          ? `<span class="stk-pill" title="Số tài khoản / STK: ${m.stk}">STK: ${m.stk}</span>`
          : '';

        return `
          <div class="member-chip" style="margin: 2px 4px 2px 0;">
            <div class="avatar-circle avatar-active">
              ${firstChar || (mIdx + 1)}
            </div>
            <span style="font-weight: 700;">${m.name.trim()}</span>
            ${stkBadge}
          </div>
        `;
      }).join('');

      // Nút thêm nhanh người vào đội
      const quickAddBtn = `
        <button class="btn-quick-add-member btn-edit-team" data-id="${team.id}" style="margin: 2px 0;" title="Thêm/sửa thành viên & STK">
          <span>＋</span> <span>Thêm người</span>
        </button>
      `;

      // Trạng thái Vào Vòng Trong tính theo Bracket Knockout
      let roundStatusPill = '';
      if (bracketState && bracketState.rounds.length > 0) {
        if (bracketState.championId === team.id) {
          roundStatusPill = `<span class="t1-pill t1-pill-gold" style="font-weight: 900;">👑 QUÁN QUÂN VÔ ĐỊCH</span>`;
        } else {
          // Tìm trận đấu gần nhất của team
          let foundMatch = false;
          let hasWonRecent = false;
          let hasLost = false;

          for (let r = bracketState.rounds.length - 1; r >= 0; r--) {
            const round = bracketState.rounds[r];
            const m = round.matches.find((match) => match.team1Id === team.id || match.team2Id === team.id);
            if (m) {
              foundMatch = true;
              if (m.completed) {
                if (m.winnerId === team.id) {
                  hasWonRecent = true;
                } else {
                  hasLost = true;
                }
              }
              break;
            }
          }

          if (hasWonRecent) {
            roundStatusPill = `<span class="t1-pill t1-pill-success" style="font-weight: 850;">🏆 ĐÃ VÀO VÒNG TRONG</span>`;
          } else if (hasLost) {
            roundStatusPill = `<span class="t1-pill" style="background: #f1f5f9; color: #94a3b8; font-weight: 700;">❌ Đã Bị Loại</span>`;
          } else if (foundMatch) {
            roundStatusPill = `<span class="t1-pill t1-pill-cyan" style="font-weight: 800;">⚔️ Đang Thi Đấu</span>`;
          } else {
            roundStatusPill = `<span class="t1-pill t1-pill-cyan">👥 Đang Tham Gia</span>`;
          }
        }
      } else {
        const memberCount = memberDetails.length;
        if (targetCapacity > 0) {
          if (memberCount >= targetCapacity) {
            roundStatusPill = `<span class="t1-pill t1-pill-success">✓ Đủ ${memberCount}/${targetCapacity} (Chờ bốc thăm)</span>`;
          } else {
            roundStatusPill = `<span class="t1-pill t1-pill-warning">⚡ ${memberCount}/${targetCapacity} người</span>`;
          }
        } else {
          roundStatusPill = `<span class="t1-pill t1-pill-cyan">👥 ${memberCount} người</span>`;
        }
      }

      return `
        <tr data-team-id="${team.id}">
          <td style="width: 50px; text-align: center; font-size: 16px;">${rankBadge}</td>
          <td style="min-width: 150px;">
            <div style="display: flex; align-items: center;">
              <strong style="color: var(--t1-text); font-size: 14.5px;">${team.name}</strong>
              ${customBadge}
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">ID: ${team.id.substring(0, 8)}...</div>
          </td>
          <td style="min-width: 300px;">
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px;">
              ${memberChips}
              ${quickAddBtn}
            </div>
          </td>
          <td style="min-width: 170px; white-space: nowrap;">${roundStatusPill}</td>
          <td style="text-align: right; white-space: nowrap; width: 140px;">
            <button
              class="t1-btn t1-btn-gold btn-edit-team"
              data-id="${team.id}"
              style="padding: 6px 12px; font-size: 12px; margin-right: 6px;"
              title="Chỉnh sửa đội & thành viên"
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
            <th>DANH SÁCH THÀNH VIÊN & STK (6 SỐ)</th>
            <th>TIẾN VÀO VÒNG TRONG</th>
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
