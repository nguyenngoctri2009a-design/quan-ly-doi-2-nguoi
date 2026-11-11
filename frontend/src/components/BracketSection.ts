import type { BracketState, MatchItem, RoundItem, Team } from '../types/team';

export function getRoundName(roundIndex: number, totalRemaining: number): string {
  if (totalRemaining <= 2) return '🏆 TRẬN CHUNG KẾT TRANH CÚP';
  if (totalRemaining <= 4) return '🔥 VÒNG BÁN KẾT';
  if (totalRemaining <= 8) return '⚡ VÒNG TỨ KẾT';
  return `⚔️ VÒNG ${roundIndex} (VÒNG LOẠI TRỰC TIẾP)`;
}

export function generateInitialBracket(teams: Team[]): BracketState {
  if (teams.length < 2) {
    throw new Error('Cần có ít nhất 2 đội để tạo cặp đấu vòng loại!');
  }

  // Xáo trộn ngẫu nhiên hoặc xếp cặp lần lượt
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const matches: MatchItem[] = [];

  let matchIndex = 1;
  for (let i = 0; i < shuffled.length; i += 2) {
    const t1 = shuffled[i];
    const t2 = shuffled[i + 1];

    if (t2) {
      matches.push({
        id: `m-1-${matchIndex}`,
        roundIndex: 1,
        team1Id: t1.id,
        team2Id: t2.id,
        team1Name: t1.name,
        team2Name: t2.name,
        completed: false,
      });
    } else {
      // Số đội lẻ -> t1 được đặc cách (bye) vào thẳng vòng trong
      matches.push({
        id: `m-1-${matchIndex}`,
        roundIndex: 1,
        team1Id: t1.id,
        team1Name: t1.name,
        winnerId: t1.id,
        winnerName: t1.name,
        isBye: true,
        completed: true,
      });
    }
    matchIndex++;
  }

  const round1: RoundItem = {
    roundIndex: 1,
    name: getRoundName(1, shuffled.length),
    matches,
  };

  return {
    currentRoundIndex: 1,
    rounds: [round1],
    updatedAt: Date.now(),
  };
}

export function advanceToNextRound(state: BracketState): BracketState {
  const currentRound = state.rounds.find((r) => r.roundIndex === state.currentRoundIndex);
  if (!currentRound) return state;

  const incomplete = currentRound.matches.filter((m) => !m.completed);
  if (incomplete.length > 0) {
    throw new Error('Vui lòng chọn kết quả cho tất cả các trận ở vòng hiện tại trước khi vào vòng trong!');
  }

  // Thu thập danh sách các đội chiến thắng
  const winners: { id: string; name: string }[] = [];
  for (const m of currentRound.matches) {
    if (m.winnerId && m.winnerName) {
      winners.push({ id: m.winnerId, name: m.winnerName });
    }
  }

  if (winners.length === 1) {
    // Đã tìm ra nhà vô địch
    return {
      ...state,
      championId: winners[0].id,
      championName: winners[0].name,
      updatedAt: Date.now(),
    };
  }

  const nextRoundIndex = state.currentRoundIndex + 1;
  const nextMatches: MatchItem[] = [];
  let matchIndex = 1;

  for (let i = 0; i < winners.length; i += 2) {
    const t1 = winners[i];
    const t2 = winners[i + 1];

    if (t2) {
      nextMatches.push({
        id: `m-${nextRoundIndex}-${matchIndex}`,
        roundIndex: nextRoundIndex,
        team1Id: t1.id,
        team2Id: t2.id,
        team1Name: t1.name,
        team2Name: t2.name,
        completed: false,
      });
    } else {
      nextMatches.push({
        id: `m-${nextRoundIndex}-${matchIndex}`,
        roundIndex: nextRoundIndex,
        team1Id: t1.id,
        team1Name: t1.name,
        winnerId: t1.id,
        winnerName: t1.name,
        isBye: true,
        completed: true,
      });
    }
    matchIndex++;
  }

  const nextRound: RoundItem = {
    roundIndex: nextRoundIndex,
    name: getRoundName(nextRoundIndex, winners.length),
    matches: nextMatches,
  };

  return {
    ...state,
    currentRoundIndex: nextRoundIndex,
    rounds: [...state.rounds, nextRound],
    updatedAt: Date.now(),
  };
}

export function renderBracketSection(
  bracketState: BracketState | null,
  teams: Team[],
  isTournamentActive: boolean
): string {
  if (teams.length < 2) {
    return `
      <div class="t1-card" style="padding: 24px 28px; margin-bottom: 24px; text-align: center; background: #ffffff;">
        <div style="font-size: 36px; margin-bottom: 10px;">⚔️</div>
        <h3 style="margin: 0 0 6px 0; font-size: 17px; font-weight: 900; color: var(--t1-text);">
          SƠ ĐỒ VÒNG ĐẤU LOẠI TRỰC TIẾP
        </h3>
        <p style="margin: 0; font-size: 13.5px; color: var(--t1-text-muted); font-weight: 600;">
          Cần ít nhất <strong>2 đội</strong> tham gia giải đấu để bắt đầu chia cặp đấu loại trực tiếp vào vòng trong.
        </p>
      </div>
    `;
  }

  if (!bracketState || bracketState.rounds.length === 0) {
    return `
      <div class="t1-card" style="padding: 28px 32px; margin-bottom: 24px; text-align: center; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);">
        <div style="font-size: 42px; margin-bottom: 12px;">🎲</div>
        <h3 style="margin: 0 0 8px 0; font-size: 19px; font-weight: 900; color: var(--t1-text);">
          SƠ ĐỒ THI ĐẤU — TÍNH THEO KIỂU VÀO VÒNG TRONG
        </h3>
        <p style="margin: 0 0 20px 0; font-size: 14px; color: var(--t1-text-muted); font-weight: 600; max-width: 600px; margin-left: auto; margin-right: auto; line-height: 1.5;">
          Hệ thống loại trực tiếp (Knockout Bracket): Đội thắng ở mỗi cặp đấu sẽ tiến thẳng vào vòng trong (Tứ Kết, Bán Kết, Chung Kết) cho đến khi tìm ra nhà vô địch!
        </p>
        <button
          type="button"
          class="t1-btn t1-btn-primary"
          id="btn-generate-bracket"
          style="padding: 12px 30px; font-size: 14.5px; font-weight: 900; box-shadow: 0 6px 18px rgba(14, 165, 233, 0.35);"
          ${!isTournamentActive ? 'disabled title="Vui lòng bấm Bắt Đầu Giải Đấu trước"' : ''}
        >
          <span>🎲 BỐC THĂM & GHÉP CẶP ĐẤU VÒNG 1</span>
        </button>
        ${!isTournamentActive ? '<div style="font-size: 12px; color: #dc2626; font-weight: 700; margin-top: 10px;">⚠️ Cần bấm nút "🚀 BẮT ĐẦU GIẢI ĐẤU" ở banner phía trên trước khi bốc thăm!</div>' : ''}
      </div>
    `;
  }

  // Hiển thị vòng đấu hiện tại & lịch sử các vòng
  const currentRound = bracketState.rounds.find((r) => r.roundIndex === bracketState.currentRoundIndex) || bracketState.rounds[bracketState.rounds.length - 1];
  const allCurrentCompleted = currentRound ? currentRound.matches.every((m) => m.completed) : false;
  const isChampionFound = Boolean(bracketState.championId);

  // Champion Banner
  let championHtml = '';
  if (isChampionFound) {
    championHtml = `
      <div class="t1-card" style="padding: 24px; margin-bottom: 24px; text-align: center; background: linear-gradient(135deg, #fefce8 0%, #fef08a 100%); border: 2px solid #eab308; box-shadow: 0 10px 25px rgba(234, 179, 8, 0.25);">
        <div style="font-size: 48px; margin-bottom: 8px; animation: bounceIcon 1s infinite alternate;">👑</div>
        <div style="font-size: 13px; font-weight: 900; color: #854d0e; text-transform: uppercase; letter-spacing: 1px;">
          GIẢI ĐẤU ĐÃ TÌM RA NHÀ VÔ ĐỊCH
        </div>
        <h2 style="margin: 6px 0 12px 0; font-size: 26px; font-weight: 950; color: #713f12;">
          🏆 ${bracketState.championName?.toUpperCase()} 🏆
        </h2>
        <div style="display: inline-block; padding: 6px 18px; border-radius: 999px; background: #ca8a04; color: #ffffff; font-size: 13px; font-weight: 900;">
          XUẤT SẮC TOÀN THẮNG CÁC VÒNG VÀ ĐOẠT NGÔI VƯƠNG!
        </div>
      </div>
    `;
  }

  // Danh sách các Round
  const roundsHtml = bracketState.rounds.map((round) => {
    const isCurrent = round.roundIndex === bracketState.currentRoundIndex;
    const matchesCount = round.matches.length;

    const matchesHtml = round.matches.map((match, mIdx) => {
      const isMatchDone = match.completed;
      const isBye = match.isBye;

      if (isBye) {
        return `
          <div class="bracket-match-card" style="background: #ffffff; border: 1.5px solid #a7f3d0; border-radius: 16px; padding: 16px; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-size: 12px; font-weight: 900; color: #059669;">TRẬN ${mIdx + 1} — ĐẶC CÁCH</span>
              <span class="t1-pill t1-pill-success" style="font-size: 11px;">🏆 VÀO THẲNG VÒNG TRONG</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <strong style="font-size: 15px; color: var(--t1-text);">${match.team1Name}</strong>
              <span style="font-size: 12.5px; color: #059669; font-weight: 800;">(Được đặc cách qua vòng)</span>
            </div>
          </div>
        `;
      }

      const team1Won = match.winnerId === match.team1Id;
      const team2Won = match.winnerId === match.team2Id;

      const team1Class = isMatchDone ? (team1Won ? 'winner-row' : 'loser-row') : '';
      const team2Class = isMatchDone ? (team2Won ? 'winner-row' : 'loser-row') : '';

      return `
        <div class="bracket-match-card" style="background: #ffffff; border: 1.5px solid ${isMatchDone ? '#e2e8f0' : '#bae6fd'}; border-radius: 16px; padding: 16px 20px; margin-bottom: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
            <span style="font-size: 12px; font-weight: 900; color: #64748b; letter-spacing: 0.5px;">TRẬN ${mIdx + 1}</span>
            <div>
              ${isMatchDone
                ? `<span class="t1-pill t1-pill-success" style="font-size: 11px;">✓ ĐÃ CÓ KẾT QUẢ</span>`
                : `<span class="t1-pill t1-pill-warning" style="font-size: 11px;">⚔️ ĐANG THI ĐẤU</span>`
              }
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px; align-items: center;">
            <!-- Đội 1 -->
            <div class="team-bracket-box ${team1Class}" style="padding: 12px 14px; border-radius: 12px; border: 1.5px solid ${team1Won ? '#10b981' : '#e2e8f0'}; background: ${team1Won ? '#ecfdf5' : '#f8fafc'}; text-align: center;">
              <div style="font-size: 15px; font-weight: 900; color: ${team1Won ? '#065f46' : 'var(--t1-text)'};">
                ${team1Won ? '👑 ' : ''}${match.team1Name}
              </div>
              <div style="margin-top: 8px;">
                ${isMatchDone
                  ? (team1Won
                      ? `<span style="font-size: 12px; font-weight: 850; color: #059669;">🏆 ĐÃ VÀO VÒNG TRONG</span>`
                      : `<span style="font-size: 12px; font-weight: 700; color: #94a3b8;">❌ Bị loại</span>`)
                  : `<button type="button" class="t1-btn t1-btn-primary btn-pick-winner" data-match-id="${match.id}" data-winner-id="${match.team1Id}" data-winner-name="${match.team1Name}" style="padding: 5px 12px; font-size: 11.5px; font-weight: 850; width: 100%;">
                      <span>🏆 Chọn Thắng</span>
                    </button>`
                }
              </div>
            </div>

            <!-- VS Divider -->
            <div style="font-size: 13px; font-weight: 900; color: #94a3b8; text-align: center;">
              VS
            </div>

            <!-- Đội 2 -->
            <div class="team-bracket-box ${team2Class}" style="padding: 12px 14px; border-radius: 12px; border: 1.5px solid ${team2Won ? '#10b981' : '#e2e8f0'}; background: ${team2Won ? '#ecfdf5' : '#f8fafc'}; text-align: center;">
              <div style="font-size: 15px; font-weight: 900; color: ${team2Won ? '#065f46' : 'var(--t1-text)'};">
                ${team2Won ? '👑 ' : ''}${match.team2Name}
              </div>
              <div style="margin-top: 8px;">
                ${isMatchDone
                  ? (team2Won
                      ? `<span style="font-size: 12px; font-weight: 850; color: #059669;">🏆 ĐÃ VÀO VÒNG TRONG</span>`
                      : `<span style="font-size: 12px; font-weight: 700; color: #94a3b8;">❌ Bị loại</span>`)
                  : `<button type="button" class="t1-btn t1-btn-primary btn-pick-winner" data-match-id="${match.id}" data-winner-id="${match.team2Id}" data-winner-name="${match.team2Name}" style="padding: 5px 12px; font-size: 11.5px; font-weight: 850; width: 100%;">
                      <span>🏆 Chọn Thắng</span>
                    </button>`
                }
              </div>
            </div>
          </div>

          ${isMatchDone && !isChampionFound ? `
            <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
              <button type="button" class="btn-reset-match" data-match-id="${match.id}" style="background: none; border: none; font-size: 11.5px; color: #64748b; font-weight: 700; cursor: pointer; text-decoration: underline;">
                ↩️ Chọn lại kết quả trận này
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="round-card t1-card" style="padding: 20px 24px; margin-bottom: 20px; border: 1.5px solid ${isCurrent ? '#38bdf8' : '#e2e8f0'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
          <div>
            <h4 style="margin: 0; font-size: 17px; font-weight: 900; color: var(--t1-text);">
              ${round.name}
            </h4>
            <div style="font-size: 12px; color: var(--t1-text-muted); font-weight: 600; margin-top: 2px;">
              Gồm ${matchesCount} trận đấu • Đội thắng tiến thẳng vào vòng trong
            </div>
          </div>
          <div>
            <span class="t1-pill ${isCurrent ? 't1-pill-cyan' : 't1-pill-success'}" style="font-size: 12px; font-weight: 800;">
              ${isCurrent ? '⚡ VÒNG ĐANG ĐẤU' : '✓ VÒNG ĐÃ XONG'}
            </span>
          </div>
        </div>

        <div class="matches-list">
          ${matchesHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="bracket-container" style="margin-bottom: 28px;">
      ${championHtml}

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 26px;">⚔️</span>
          <div>
            <h3 style="margin: 0; font-size: 18px; font-weight: 900; color: var(--t1-text);">
              Sơ Đồ Thi Đấu & Đội Vào Vòng Trong
            </h3>
            <div style="font-size: 12.5px; color: var(--t1-text-muted); font-weight: 600;">
              Bấm "🏆 Chọn Thắng" để đưa đội vào vòng sau.
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${allCurrentCompleted && !isChampionFound ? `
            <button type="button" class="t1-btn t1-btn-success" id="btn-advance-round" style="padding: 9px 20px; font-size: 13.5px; font-weight: 900; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
              <span>🚀 BẮT ĐẦU VÒNG TIẾP THEO (VÀO VÒNG TRONG)</span>
            </button>
          ` : ''}
          <button type="button" class="t1-btn t1-btn-secondary" id="btn-reset-bracket" style="padding: 8px 16px; font-size: 12.5px; font-weight: 800;" title="Xóa sơ đồ và bốc thăm lại từ đầu">
            <span>🔄 Bốc Thăm Lại</span>
          </button>
        </div>
      </div>

      <div class="rounds-container">
        ${roundsHtml}
      </div>
    </div>
  `;
}
