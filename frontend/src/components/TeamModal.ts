import type { CreateTeamDto, MemberItem, Team, UpdateTeamDto } from '../types/team';

export class TeamModal {
  private overlay: HTMLElement;
  private currentTeam: Team | null = null;
  private onSaveCallback: ((dto: CreateTeamDto | UpdateTeamDto, id?: string) => Promise<void>) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 't1-modal-overlay';
    this.render();
    document.body.appendChild(this.overlay);
    this.bindEvents();
  }

  private render(): void {
    this.overlay.innerHTML = `
      <div class="t1-modal-box" style="max-width: 600px;">
        <h3 id="modal-title" style="margin-top: 0; margin-bottom: 8px; font-size: 20px; font-weight: 900; color: var(--t1-text);">
          Chỉnh Sửa Đội Thi Đấu
        </h3>
        <p id="modal-subtitle" style="margin: 0 0 20px 0; font-size: 13px; color: var(--t1-text-muted); font-weight: 600;">
          Chỉnh sửa tên đội, thêm/xóa thành viên và cập nhật STK (tối đa 6 số).
        </p>

        <form id="team-form">
          <div class="form-group">
            <label class="form-label" for="input-team-name">Tên Đội</label>
            <input
              type="text"
              id="input-team-name"
              class="t1-input"
              placeholder="VD: Đội 1, Đội 2, Sát Thủ, Rồng Vàng..."
              maxlength="50"
            />
            <div class="form-hint">Tối đa 50 ký tự. Có thể chỉnh sửa thành bất kỳ tên nào.</div>
          </div>

          <div class="form-group" style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <label class="form-label" style="margin: 0;">DANH SÁCH THÀNH VIÊN & STK (6 SỐ)</label>
              <button type="button" class="t1-btn t1-btn-primary" id="btn-add-member-input" style="padding: 6px 14px; font-size: 12px;">
                <span>＋ Thêm Thành Viên</span>
              </button>
            </div>
            
            <div id="modal-member-inputs-container" class="member-inputs-container" style="max-height: 280px; overflow-y: auto; padding-right: 4px;">
              <!-- Cứ ấn cộng sẽ tự sinh ô nhập tại đây -->
            </div>
          </div>

          <div id="modal-error-box" style="display: none; margin-bottom: 16px; padding: 10px 14px; border-radius: 12px; background: #fee2e2; color: #991b1b; font-size: 12.5px; font-weight: 700;"></div>

          <div class="modal-footer">
            <button type="button" class="t1-btn t1-btn-secondary" id="btn-cancel-modal">
              Hủy Bỏ
            </button>
            <button type="submit" class="t1-btn t1-btn-primary" id="btn-submit-modal">
              <span>Lưu Dữ Liệu</span>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  private bindEvents(): void {
    const cancelBtn = this.overlay.querySelector('#btn-cancel-modal');
    cancelBtn?.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    const addMemberBtn = this.overlay.querySelector('#btn-add-member-input');
    addMemberBtn?.addEventListener('click', () => {
      this.addMemberField('', '');
    });

    const form = this.overlay.querySelector('#team-form') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });
  }

  private addMemberField(initialName = '', initialStk = ''): void {
    const container = this.overlay.querySelector('#modal-member-inputs-container') as HTMLElement;
    const currentRows = container.querySelectorAll('.dynamic-member-row');

    if (currentRows.length >= 25) {
      alert('Tối đa 25 thành viên mỗi đội!');
      return;
    }

    const memberIndex = currentRows.length + 1;
    const row = document.createElement('div');
    row.className = 'dynamic-member-row';
    row.innerHTML = `
      <div class="member-input-badge">#${memberIndex}</div>
      <div class="member-name-flex">
        <input
          type="text"
          class="t1-input member-name-input"
          placeholder="Tên thành viên ${memberIndex}..."
          maxlength="50"
          value="${initialName}"
        />
      </div>
      <div class="member-stk-flex">
        <input
          type="text"
          class="t1-input stk-input member-stk-input"
          placeholder="STK (6 số)"
          maxlength="6"
          pattern="[0-9]*"
          value="${initialStk}"
          title="STK gồm tối đa 6 chữ số"
        />
      </div>
      <button type="button" class="btn-remove-member" title="Xóa thành viên này">✕</button>
    `;

    // Ràng buộc chỉ cho gõ số vào ô STK
    const stkInp = row.querySelector('.member-stk-input') as HTMLInputElement;
    stkInp?.addEventListener('input', () => {
      stkInp.value = stkInp.value.replace(/\D/g, '').slice(0, 6);
    });

    const removeBtn = row.querySelector('.btn-remove-member');
    removeBtn?.addEventListener('click', () => {
      row.remove();
      this.reindexMemberFields();
    });

    container.appendChild(row);
    const input = row.querySelector('.member-name-input') as HTMLInputElement;
    input.focus();
  }

  private reindexMemberFields(): void {
    const container = this.overlay.querySelector('#modal-member-inputs-container') as HTMLElement;
    const rows = container.querySelectorAll('.dynamic-member-row');
    rows.forEach((r, idx) => {
      const badge = r.querySelector('.member-input-badge');
      const input = r.querySelector('.member-name-input') as HTMLInputElement;
      if (badge) badge.textContent = `#${idx + 1}`;
      if (input) input.placeholder = `Tên thành viên ${idx + 1}...`;
    });
  }

  public open(team?: Team, onSave?: (dto: CreateTeamDto | UpdateTeamDto, id?: string) => Promise<void>): void {
    this.currentTeam = team || null;
    this.onSaveCallback = onSave || null;

    const titleEl = this.overlay.querySelector('#modal-title') as HTMLElement;
    const subEl = this.overlay.querySelector('#modal-subtitle') as HTMLElement;
    const nameInput = this.overlay.querySelector('#input-team-name') as HTMLInputElement;
    const errBox = this.overlay.querySelector('#modal-error-box') as HTMLElement;
    const container = this.overlay.querySelector('#modal-member-inputs-container') as HTMLElement;

    errBox.style.display = 'none';
    container.innerHTML = '';

    if (team) {
      titleEl.textContent = `Chỉnh Sửa: ${team.name}`;
      subEl.textContent = 'Chỉnh sửa tên đội, thêm/xóa thành viên và cập nhật STK (6 số).';
      nameInput.value = team.name;

      const details = (team.memberDetails && team.memberDetails.length > 0)
        ? team.memberDetails
        : (team.members || [team.member1, team.member2].filter(Boolean)).map((m) => ({ name: m, stk: '' }));

      if (details.length > 0) {
        details.forEach((d) => this.addMemberField(d.name, d.stk || ''));
      } else {
        this.addMemberField('', '');
      }
    } else {
      titleEl.textContent = 'Thêm Đội Mới';
      subEl.textContent = 'Để trống tên đội để tự sinh "Đội 1", "Đội 2"... Bấm dấu ＋ để thêm thành viên.';
      nameInput.value = '';
      this.addMemberField('', '');
    }

    this.overlay.classList.add('active');
    setTimeout(() => nameInput.focus(), 100);
  }

  public close(): void {
    this.overlay.classList.remove('active');
    this.currentTeam = null;
  }

  private async handleSubmit(): Promise<void> {
    const nameInput = this.overlay.querySelector('#input-team-name') as HTMLInputElement;
    const submitBtn = this.overlay.querySelector('#btn-submit-modal') as HTMLButtonElement;
    const errBox = this.overlay.querySelector('#modal-error-box') as HTMLElement;
    const container = this.overlay.querySelector('#modal-member-inputs-container') as HTMLElement;

    const rows = container.querySelectorAll('.dynamic-member-row');
    const memberDetails: MemberItem[] = [];

    rows.forEach((row) => {
      const nameInp = row.querySelector('.member-name-input') as HTMLInputElement;
      const stkInp = row.querySelector('.member-stk-input') as HTMLInputElement;
      const name = nameInp ? nameInp.value.trim() : '';
      const stk = stkInp ? stkInp.value.trim().slice(0, 6) : '';
      if (name) {
        memberDetails.push({ name, stk });
      }
    });

    const name = nameInput.value.trim();

    if (this.currentTeam && !name) {
      errBox.textContent = 'Tên đội không được để trống khi chỉnh sửa.';
      errBox.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Đang lưu...</span>';
    errBox.style.display = 'none';

    try {
      if (this.onSaveCallback) {
        const members = memberDetails.map((m) => m.name);
        if (this.currentTeam) {
          const dto: UpdateTeamDto = {
            name,
            members,
            memberDetails,
            member1: members[0] || '',
            member2: members[1] || '',
          };
          await this.onSaveCallback(dto, this.currentTeam.id);
        } else {
          const dto: CreateTeamDto = {
            name: name || undefined,
            members,
            memberDetails,
            member1: members[0] || undefined,
            member2: members[1] || undefined,
          };
          await this.onSaveCallback(dto);
        }
      }
      this.close();
    } catch (err) {
      errBox.textContent = err instanceof Error ? err.message : String(err);
      errBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Lưu Dữ Liệu</span>';
    }
  }
}
