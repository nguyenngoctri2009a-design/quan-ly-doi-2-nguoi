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
        <h3 id="modal-title" style="margin-top: 0; margin-bottom: 8px; font-size: 19px; font-weight: 900; color: var(--t1-text);">
          Thêm Đội Mới
        </h3>
        <p id="modal-subtitle" style="margin: 0 0 20px 0; font-size: 13px; color: var(--t1-text-muted); font-weight: 600;">
          Nhập thông tin đội 2 người. Nếu để trống tên đội, hệ thống sẽ tự động gán tên mặc định theo thứ tự.
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
            <div class="form-hint">Tối đa 50 ký tự. Để trống để nhận tên mặc định tự tăng.</div>
          </div>

          <div class="form-group">
            <label class="form-label" for="input-member-1">Thành Viên 1</label>
            <input
              type="text"
              id="input-member-1"
              class="t1-input"
              placeholder="Tên thành viên thứ nhất..."
              maxlength="50"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="input-member-2">Thành Viên 2</label>
            <input
              type="text"
              id="input-member-2"
              class="t1-input"
              placeholder="Tên thành viên thứ hai..."
              maxlength="50"
            />
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

    const form = this.overlay.querySelector('#team-form') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });
  }

  public open(team?: Team, onSave?: (dto: CreateTeamDto | UpdateTeamDto, id?: string) => Promise<void>): void {
    this.currentTeam = team || null;
    this.onSaveCallback = onSave || null;

    const titleEl = this.overlay.querySelector('#modal-title') as HTMLElement;
    const subEl = this.overlay.querySelector('#modal-subtitle') as HTMLElement;
    const nameInput = this.overlay.querySelector('#input-team-name') as HTMLInputElement;
    const m1Input = this.overlay.querySelector('#input-member-1') as HTMLInputElement;
    const m2Input = this.overlay.querySelector('#input-member-2') as HTMLInputElement;
    const errBox = this.overlay.querySelector('#modal-error-box') as HTMLElement;

    errBox.style.display = 'none';

    if (team) {
      titleEl.textContent = `Chỉnh Sửa: ${team.name}`;
      subEl.textContent = 'Cập nhật lại tên hiển thị hoặc thông tin 2 thành viên của đội.';
      nameInput.value = team.name;
      m1Input.value = team.member1;
      m2Input.value = team.member2;
    } else {
      titleEl.textContent = 'Thêm Đội Mới';
      subEl.textContent = 'Nhập thông tin đội 2 người. Nếu để trống tên đội, hệ thống sẽ tự sinh số mặc định.';
      nameInput.value = '';
      m1Input.value = '';
      m2Input.value = '';
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
    const m1Input = this.overlay.querySelector('#input-member-1') as HTMLInputElement;
    const m2Input = this.overlay.querySelector('#input-member-2') as HTMLInputElement;
    const submitBtn = this.overlay.querySelector('#btn-submit-modal') as HTMLButtonElement;
    const errBox = this.overlay.querySelector('#modal-error-box') as HTMLElement;

    const name = nameInput.value.trim();
    const member1 = m1Input.value.trim();
    const member2 = m2Input.value.trim();

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
