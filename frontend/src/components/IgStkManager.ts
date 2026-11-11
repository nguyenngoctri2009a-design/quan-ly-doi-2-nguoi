import type { IgStkMember, ParsedIgStkItem } from '../types/team';

export function parseIgStkInput(text: string, existingMembers: IgStkMember[]): ParsedIgStkItem[] {
  if (!text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const rawPairs: { ig: string; stk: string; raw: string }[] = [];

  let pendingIg = '';
  let pendingRaw: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Bỏ qua dòng kết thúc hoặc bình luận trò chuyện không liên quan
    if (
      trimmed.startsWith('ĐỊCH DANG') ||
      trimmed.startsWith('Quản lý chiếm đóng') ||
      trimmed.toLowerCase().startsWith('tước hiệu')
    ) {
      continue;
    }

    // Kiểm tra xem dòng có phải là Discord header (VD: BUA | Adam John [G5VN], — Hôm qua lúc 11:43 SA)
    const isDiscordHeader = /—\s*(?:hôm\s*qua|hôm\s*nay|\d{1,2}:\d{2})/i.test(trimmed);
    if (isDiscordHeader) {
      pendingIg = '';
      pendingRaw = [trimmed];
      continue;
    }

    // Trường hợp 1: Dòng chứa CẢ IG và STK trên cùng 1 dòng
    // VD: "ig ; Beo Blackk Stk 788221" hoặc "IG : Cao Namqb ... STK : 520502"
    const sameLineMatch = trimmed.match(
      /(?:ig|instagram|tên\s*ingame)[:\s\.\;\-]+(.+?)\s+(?:stk|skt|stk\s*ingame|số\s*tài\s*khoản)[:\s\.\;\-]*([0-9]{4,15})\b/i
    );
    if (sameLineMatch) {
      const ig = sameLineMatch[1].replace(/^[:\-\s\.\;]+|[:\-\s\.\;,]+$/g, '').trim();
      const stk = sameLineMatch[2].trim();
      rawPairs.push({ ig, stk, raw: trimmed });
      pendingIg = '';
      pendingRaw = [];
      continue;
    }

    // Trường hợp 2: Dòng chứa IG
    // VD: "Ig: Adam John", "Ig Toxi Zach", "IG Truongg loic", "Tên ingame : Minkey Dote"
    const igLineMatch = trimmed.match(/^(?:ig|instagram|tên\s*ingame)[:\s\.\;\-]+(.+)$/i);
    if (igLineMatch) {
      pendingIg = igLineMatch[1].replace(/^[:\-\s\.\;]+|[:\-\s\.\;,]+$/g, '').trim();
      pendingRaw.push(trimmed);
      continue;
    }

    // Trường hợp 3: Dòng chứa STK
    // VD: "Stk: 497077", "STK 854726", "Skt 992884", "Stk.535295", "STK ingame : 807208"
    const stkLineMatch = trimmed.match(/^(?:stk|skt|stk\s*ingame|số\s*tài\s*khoản)[:\s\.\;\-]*([0-9]{4,15})\b/i);
    if (stkLineMatch) {
      const stk = stkLineMatch[1].trim();
      if (pendingIg) {
        rawPairs.push({
          ig: pendingIg,
          stk,
          raw: pendingRaw.concat(trimmed).join(' | '),
        });
        pendingIg = '';
        pendingRaw = [];
      } else {
        rawPairs.push({
          ig: '',
          stk,
          raw: trimmed,
        });
      }
      continue;
    }

    // Trường hợp 4: Dự phòng cho dòng đơn lẻ nhưng có số STK (vd có người ghi mỗi số tài khoản)
    const fallbackStk = trimmed.match(/\b([0-9]{5,10})\b/);
    if (fallbackStk && pendingIg) {
      rawPairs.push({
        ig: pendingIg,
        stk: fallbackStk[1],
        raw: pendingRaw.concat(trimmed).join(' | '),
      });
      pendingIg = '';
      pendingRaw = [];
    }
  }

  // Map các STK đã tồn tại trong database để check trùng
  const existingStkMap = new Map<string, string>();
  for (const m of existingMembers) {
    if (m.stk) existingStkMap.set(m.stk.trim().toLowerCase(), m.ig);
  }

  const results: ParsedIgStkItem[] = [];
  const seenStksInInput = new Set<string>();

  for (const pair of rawPairs) {
    let ig = pair.ig.replace(/^[:\-\s\.\;]+|[:\-\s\.\;,]+$/g, '').trim();
    ig = ig.replace(/^\d+[\.\-\)]\s*/, '').trim();
    const stk = pair.stk.trim();

    let status: ParsedIgStkItem['status'] = 'valid';
    let statusText = '✓ Hợp lệ';

    if (!ig && !stk) {
      status = 'invalid_ig';
      statusText = '❌ Không nhận diện được dữ liệu';
    } else if (!ig) {
      status = 'invalid_ig';
      statusText = '❌ Thiếu tên IG';
    } else if (!stk || stk.length < 4) {
      status = 'invalid_stk';
      statusText = '❌ Thiếu hoặc sai định dạng STK';
    } else if (existingStkMap.has(stk.toLowerCase())) {
      const existingName = existingStkMap.get(stk.toLowerCase());
      status = 'duplicate_stk_db';
      statusText = `⚠️ Trùng STK trong hệ thống (${existingName})`;
    } else if (seenStksInInput.has(stk.toLowerCase())) {
      status = 'duplicate_stk_input';
      statusText = '⚠️ Trùng STK trong nội dung vừa dán';
    } else {
      seenStksInInput.add(stk.toLowerCase());
    }

    results.push({
      raw: pair.raw,
      ig,
      stk,
      status,
      statusText,
    });
  }

  return results;
}

export function exportIgStkToExcel(members: IgStkMember[]): void {
  if (members.length === 0) {
    alert('Không có dữ liệu thành viên để xuất!');
    return;
  }

  // Định dạng CSV chuẩn UTF-8 kèm BOM (\uFEFF) giúp mở trực tiếp bằng Microsoft Excel không bị lỗi font Tiếng Việt
  const header = ['STT', 'TÊN IG', 'SỐ TÀI KHOẢN (STK)', 'NGÀY TẠO'];
  const rows = members.map((m, idx) => {
    const createdDate = m.createdAt ? new Date(m.createdAt).toLocaleString('vi-VN') : '';
    // Thêm dấu nháy kép để tránh lỗi nếu tên có dấu phẩy, và ép STK dạng chuỗi ('="123456"') để Excel không làm mất số 0 đầu
    const cleanIg = `"${m.ig.replace(/"/g, '""')}"`;
    const cleanStk = `="${m.stk}"`;
    const cleanDate = `"${createdDate}"`;
    return [idx + 1, cleanIg, cleanStk, cleanDate].join(',');
  });

  const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  link.setAttribute('download', `danh_sach_ig_stk_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function renderIgStkTab(
  members: IgStkMember[],
  parsedItems: ParsedIgStkItem[],
  searchQuery: string,
  selectedIds: Set<string>,
  skipDuplicates: boolean
): string {
  // Lọc theo tìm kiếm
  const q = searchQuery.trim().toLowerCase();
  const filteredMembers = members.filter((m) => {
    if (!q) return true;
    return m.ig.toLowerCase().includes(q) || m.stk.toLowerCase().includes(q);
  });

  // Đếm thống kê phân tích
  const validParsed = parsedItems.filter((p) => p.status === 'valid');
  const duplicateParsed = parsedItems.filter((p) => p.status.includes('duplicate'));
  const invalidParsed = parsedItems.filter((p) => p.status.startsWith('invalid'));

  // Bản xem trước nếu đã phân tích
  let previewSection = '';
  if (parsedItems.length > 0) {
    const previewRows = parsedItems.map((item, idx) => {
      let badgeClass = 't1-pill-success';
      if (item.status.includes('duplicate')) badgeClass = 't1-pill-warning';
      if (item.status.startsWith('invalid')) badgeClass = 't1-pill-danger';

      return `
        <tr>
          <td style="text-align: center; width: 45px; font-weight: 800; color: #64748b;">#${idx + 1}</td>
          <td>
            <strong style="color: var(--t1-text); font-size: 14px;">${item.ig || '<em style="color:#ef4444;">(Chưa có)</em>'}</strong>
          </td>
          <td>
            <code style="background: #f1f5f9; padding: 2px 8px; border-radius: 6px; font-weight: 800; color: var(--t1-primary); font-size: 13.5px;">${item.stk || '<em style="color:#ef4444;">(Chưa có)</em>'}</code>
          </td>
          <td>
            <span class="t1-pill ${badgeClass}" style="font-size: 11.5px; font-weight: 800;">
              ${item.statusText}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    previewSection = `
      <div class="t1-card" style="margin-top: 20px; padding: 20px 24px; border: 1.5px solid #bae6fd; background: #f8fafc;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 16px; font-weight: 900; color: var(--t1-text);">
              📋 Bản Xem Trước Dữ Liệu Phân Tích (${parsedItems.length} dòng)
            </h4>
            <div style="font-size: 12.5px; color: var(--t1-text-muted); font-weight: 600; margin-top: 2px;">
              Hợp lệ: <strong style="color: #10b981;">${validParsed.length}</strong> • 
              Trùng STK: <strong style="color: #f59e0b;">${duplicateParsed.length}</strong> • 
              Lỗi: <strong style="color: #ef4444;">${invalidParsed.length}</strong>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #475569; cursor: pointer;">
              <input type="checkbox" id="chk-skip-duplicates" ${skipDuplicates ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;" />
              <span>Tự động bỏ qua các STK bị trùng</span>
            </label>
            <button type="button" class="t1-btn t1-btn-success" id="btn-confirm-add-parsed" style="padding: 9px 22px; font-size: 13.5px; font-weight: 900;">
              <span>💾 Xác Nhận Thêm (${validParsed.length} Hợp Lệ)</span>
            </button>
          </div>
        </div>

        <div class="t1-table-wrap" style="max-height: 280px; overflow-y: auto;">
          <table class="t1-table">
            <thead>
              <tr>
                <th style="width: 45px; text-align: center;">STT</th>
                <th>TÊN IG</th>
                <th>SỐ TÀI KHOẢN (STK)</th>
                <th>TRẠNG THÁI</th>
              </tr>
            </thead>
            <tbody>
              ${previewRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Danh sách thành viên chính
  const allSelected = filteredMembers.length > 0 && filteredMembers.every((m) => selectedIds.has(m.id));
  const someSelected = selectedIds.size > 0;

  const memberRows = filteredMembers.map((m, idx) => {
    const isChecked = selectedIds.has(m.id);

    return `
      <tr data-member-id="${m.id}" style="${isChecked ? 'background: #f0fdf4;' : ''}">
        <td style="width: 45px; text-align: center;">
          <input type="checkbox" class="chk-select-member" data-id="${m.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;" />
        </td>
        <td style="width: 50px; text-align: center; font-weight: 800; color: #64748b;">#${idx + 1}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="color: var(--t1-text); font-size: 14.5px;">${m.ig}</strong>
            <button
              type="button"
              class="btn-copy-text"
              data-text="${m.ig}"
              title="Nhấp để sao chép tên IG"
              style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px 6px; font-size: 11px; cursor: pointer; color: #475569; font-weight: 700;"
            >
              📋 Copy IG
            </button>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <code style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 4px 10px; border-radius: 8px; font-weight: 900; color: #047857; font-size: 14px; letter-spacing: 0.5px;">
              ${m.stk}
            </code>
            <button
              type="button"
              class="btn-copy-text"
              data-text="${m.stk}"
              title="Nhấp để sao chép STK"
              style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px 6px; font-size: 11px; cursor: pointer; color: #475569; font-weight: 700;"
            >
              📋 Copy STK
            </button>
          </div>
        </td>
        <td style="text-align: right; white-space: nowrap; width: 140px;">
          <button
            type="button"
            class="t1-btn t1-btn-gold btn-edit-ig-stk"
            data-id="${m.id}"
            data-ig="${m.ig}"
            data-stk="${m.stk}"
            style="padding: 6px 12px; font-size: 12px; margin-right: 6px;"
            title="Chỉnh sửa thông tin"
          >
            ✏️ Sửa
          </button>
          <button
            type="button"
            class="t1-btn t1-btn-danger btn-delete-ig-stk"
            data-id="${m.id}"
            data-ig="${m.ig}"
            style="padding: 6px 12px; font-size: 12px;"
            title="Xóa thành viên này"
          >
            🗑️ Xóa
          </button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="ig-stk-tab-container">
      <!-- HEADER TAB: TỔNG QUAN & NÚT XUẤT EXCEL -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="font-size: 34px;">💳</div>
          <div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 900; color: var(--t1-text);">
              Quản Lý Danh Sách IG – STK
            </h2>
            <div style="font-size: 13px; color: var(--t1-text-muted); font-weight: 600; margin-top: 2px;">
              Lưu trữ danh bạ IG & STK, hỗ trợ dán hàng loạt từ Discord / tin nhắn, chống trùng lặp STK.
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button type="button" class="t1-btn t1-btn-success" id="btn-export-excel" style="padding: 9px 20px; font-size: 13.5px; font-weight: 900;">
            <span>📊 Xuất Excel (.CSV)</span>
          </button>
        </div>
      </div>

      <!-- KHU VỰC NHẬP NHANH HÀNG LOẠT (PASTE TỪ DISCORD) -->
      <div class="t1-card" style="padding: 24px; margin-bottom: 24px; background: #ffffff;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">⚡</span>
            <label class="form-label" style="margin: 0; font-size: 15px; font-weight: 900; color: var(--t1-text);">
              KHU VỰC NHẬP NHANH TỪ DISCORD / TIN NHẮN (HÀNG LOẠT)
            </label>
          </div>
          <span style="font-size: 12px; font-weight: 700; color: var(--t1-text-muted);">
            Tự động lọc tên IG, STK và bỏ sạch ngày giờ, tên nhóm BUA thừa
          </span>
        </div>

        <textarea
          id="textarea-bulk-input"
          class="t1-input"
          style="width: 100%; min-height: 120px; font-family: monospace; font-size: 13.5px; line-height: 1.6; resize: vertical;"
          placeholder="Dán hàng chục hoặc hàng trăm dòng vào đây, ví dụ:&#10;IG: Adam John Stk: 497077&#10;Ig Toxi Zach Stk: 599708&#10;ig Gia Bảo Leshi STK 854726&#10;IG: Nexus star Stk: 220042&#10;[BUA] 10:30 PM: Ig: John Doe Stk: 123456"
        ></textarea>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; gap: 8px;">
            <button type="button" class="t1-btn t1-btn-primary" id="btn-parse-data" style="padding: 10px 24px; font-size: 13.5px; font-weight: 900;">
              <span>⚡ Phân Tích Dữ Liệu</span>
            </button>
            <button type="button" class="t1-btn t1-btn-secondary" id="btn-clear-bulk-input" style="padding: 10px 18px; font-size: 13px;">
              <span>🗑️ Xóa Vùng Nhập</span>
            </button>
          </div>

          <div style="font-size: 12.5px; color: #64748b; font-weight: 600;">
            💡 Hỗ trợ mọi kiểu chữ hoa/thường: <code>IG</code>, <code>Ig</code>, <code>ig</code>, <code>STK</code>, <code>Stk</code>, <code>stk</code>
          </div>
        </div>

        <!-- BẢN XEM TRƯỚC NẾU CÓ DỮ LIỆU PHÂN TÍCH -->
        ${previewSection}
      </div>

      <!-- THANH TÌM KIẾM & THAO TÁC HÀNG LOẠT -->
      <div class="t1-card toolbar-card" style="margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 260px;">
          <div class="search-box-wrapper" style="flex: 1;">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              id="search-ig-stk-input"
              class="t1-input search-input-field"
              placeholder="Tìm theo tên IG hoặc STK..."
              value="${searchQuery}"
            />
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          ${someSelected ? `
            <button type="button" class="t1-btn t1-btn-danger" id="btn-bulk-delete" style="padding: 8px 18px; font-size: 13px; font-weight: 900;">
              <span>🗑️ Xóa ${selectedIds.size} Mục Đã Chọn</span>
            </button>
          ` : ''}
          <div style="font-size: 13px; font-weight: 800; color: var(--t1-text-muted);">
            Tổng số: <strong style="color: var(--t1-primary); font-size: 15px;">${members.length}</strong> thành viên
            ${q ? ` (Khớp: <strong>${filteredMembers.length}</strong>)` : ''}
          </div>
        </div>
      </div>

      <!-- BẢNG DANH SÁCH CHÍNH -->
      ${filteredMembers.length === 0 ? `
        <div class="t1-card empty-state">
          <div class="empty-icon">${searchQuery ? '🔍' : '📂'}</div>
          <div class="empty-title">
            ${searchQuery ? `Không tìm thấy kết quả cho "${searchQuery}"` : 'Danh sách IG – STK hiện đang trống'}
          </div>
          <div class="empty-desc">
            ${searchQuery ? 'Hãy thử tìm kiếm với tên IG hoặc STK khác.' : 'Dán dữ liệu từ Discord vào khung phía trên và bấm "Phân Tích Dữ Liệu" để thêm nhanh hàng loạt!'}
          </div>
        </div>
      ` : `
        <div class="t1-table-wrap">
          <table class="t1-table">
            <thead>
              <tr>
                <th style="width: 45px; text-align: center;">
                  <input type="checkbox" id="chk-select-all" ${allSelected ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;" title="Chọn tất cả" />
                </th>
                <th style="width: 50px; text-align: center;">STT</th>
                <th>TÊN INSTAGRAM (IG)</th>
                <th>SỐ TÀI KHOẢN (STK)</th>
                <th style="text-align: right;">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              ${memberRows}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}
