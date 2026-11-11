import type { CreateTeamDto, Team, UpdateTeamDto } from '../types/team';

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
      <div class="t1-modal-box">
        <h3 id="modal-title" style="margin-top: 0; margin-bottom: 8px; font-size: 20px; font-weight: 900; color: var(--t1-text);">
          Thêm Đội Mới
        </h3>
        <p id="modal-subtitle" style="margin: 0 0 20px 0; font-size: 13px; color: var(--t1-text-muted); font-weight: 600;">
          Để trống tên đội để hệ thống tự sinh số mặc định ("Đội 1", "Đội 2"...).
        </p>

        <form id="team-form">
          <div class="form-group">
            <label class="form-label" for="input-team-name">Tên Đội</label>
            <input
              type="text"
              id="input-team-name"
              class="t1-input"
              placeholder="VD: Đội 1, Chiến Binh Rồng, Sát Thủ..."
              maxlength="50"
            />
            <div class="form-hint">Tối đa 50 ký tự. Để trống sẽ tự gán số mặc định tăng dần.</div>
          </div>

          <div class="form-group" style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <label class="form-label" style="margin: 0;">DANH SÁCH THÀNH VIÊN (TỐI ĐA 2 NGƯỜI)</label>
              <button type="button" class="t1-btn t1-btn-primary" id="btn-add-member-input" style="padding: 6px 14px; font-size: 12px;">
                <span>＋ Thêm Ô Nhập Tên</span>
              </button>
            </div>
            
            <div id="modal-member-inputs-container" class="member-inputs-container">
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
      this.addMemberField('');
    });

    const form = this.overlay.querySelector('#team-form') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });
  }

  private addMemberField(initialValue = ''): void {
    const container = this.overlay.querySelector('#modal-member-inputs-container') as HTMLElement;
    const currentRows = container.querySelectorAll('.dynamic-member-row');

    if (currentRows.length >= 2) {
      alert('Mỗi đội tối đa 2 thành viên!');
      return;
    }

    const memberIndex = currentRows.length + 1;
    const row = document.createElement('div');
    row.className = 'dynamic-member-row';
    row.innerHTML = `
      <div class="member-input-badge">#${memberIndex}</div>
      <input
        type="text"
        class="t1-input member-name-input"
        placeholder="Nhập tên thành viên ${memberIndex}..."
        maxlength="50"
        value="${initialValue}"
      />
      <button type="button" class="btn-remove-member" title="Xóa ô nhập">✕</button>
    `;

    const removeBtn = row.querySelector('.btn-remove-member');
    removeBtn?.addEventListener('click', () => {
      row.remove();
      this.reindexMemberFields();
    });

    container.appendChild(row);
    const input = row.querySelector('input') as HTMLInputElement;
    input.focus();
    this.updateAddButtonState();
  }

  private reindexMemberFields(): void {
    const container = this.overlay.querySelector('#modal-member-inputs-container') as HTMLElement;
    const rows = container.querySelectorAll('.dynamic-member-row');
    rows.forEach((r, idx) => {
      const badge = r.querySelector('.member-input-badge');
      const input = r.querySelector('input');
      if (badge) badge.textContent = `#${idx + 1}`;
      if (input) input.placeholder = `Nhập tên thành viên ${idx + 1}...`;
    });
    this.updateAddButtonState();
  }

  private updateAddButtonState(): void {
    const container = this.overlay.querySelector('#modal-member-inputs-container') as HTMLElement;
    const addBtn = this.overlay.querySelector('#btn-add-member-input') as HTMLButtonElement;
    const currentCount = container.querySelectorAll('.dynamic-member-row').length;
    if (addBtn) {
      addBtn.style.display = currentCount >= 2 ? 'none' : 'inline-flex';
    }
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
      subEl.textContent = 'Cập nhật lại tên đội hoặc thành viên.';
      nameInput.value = team.name;

      if (team.member1.trim()) this.addMemberField(team.member1.trim());
      if (team.member2.trim()) this.addMemberField(team.member2.trim());

      // Nếu chưa có thành viên nào, tự tạo 1 ô mặc định
      if (!team.member1.trim() && !team.member2.trim()) {
        this.addMemberField('');
      }
    } else {
      titleEl.textContent = 'Thêm Đội Mới';
      subEl.textContent = 'Để trống tên đội để hệ thống tự sinh số mặc định. Bấm dấu ＋ để thêm ô nhập thành viên.';
      nameInput.value = '';
      // Tự động có sẵn 1 ô đầu tiên cho tiện
      this.addMemberField('');
    }

    this.updateAddButtonState();
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

    const inputs = container.querySelectorAll('.member-name-input') as NodeListOf<HTMLInputElement>;
    const members: string[] = [];
    inputs.forEach((inp) => {
      const val = inp.value.trim();
      if (val) members.push(val);
    });

    const name = nameInput.value.trim();
    const member1 = members[0] || '';
    const member2 = members[1] || '';

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
        if (this.currentTeam) {
          const dto: UpdateTeamDto = { name, member1, member2 };
          await this.onSaveCallback(dto, this.currentTeam.id);
        } else {
          const dto: CreateTeamDto = {
            name: name || undefined,
            member1: member1 || undefined,
            member2: member2 || undefined,
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
