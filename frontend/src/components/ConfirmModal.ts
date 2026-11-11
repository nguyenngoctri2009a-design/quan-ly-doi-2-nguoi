export class ConfirmModal {
  private overlay: HTMLElement;
  private onConfirmCallback: (() => Promise<void>) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 't1-modal-overlay';
    this.render();
    document.body.appendChild(this.overlay);
    this.bindEvents();
  }

  private render(): void {
    this.overlay.innerHTML = `
      <div class="t1-modal-box" style="max-width: 440px; text-align: center;">
        <div style="font-size: 44px; margin-bottom: 12px;">⚠️</div>
        <h3 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 900; color: #dc2626;">
          Xác Nhận Xóa Đội
        </h3>
        <p id="confirm-msg" style="margin: 0 0 24px 0; font-size: 13.5px; color: var(--t1-text-muted); font-weight: 600; line-height: 1.5;">
          Bạn có chắc chắn muốn xóa đội này không? Dữ liệu và thông tin thành viên sẽ bị xóa vĩnh viễn khỏi Firebase.
        </p>

        <div style="display: flex; justify-content: center; gap: 12px;">
          <button type="button" class="t1-btn t1-btn-secondary" id="btn-cancel-confirm">
            Hủy Bỏ
          </button>
          <button type="button" class="t1-btn t1-btn-danger" id="btn-execute-confirm">
            <span>Xóa Ngay</span>
          </button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const cancelBtn = this.overlay.querySelector('#btn-cancel-confirm');
    cancelBtn?.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    const confirmBtn = this.overlay.querySelector('#btn-execute-confirm') as HTMLButtonElement;
    confirmBtn?.addEventListener('click', async () => {
      if (this.onConfirmCallback) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span>Đang xóa...</span>';
        try {
          await this.onConfirmCallback();
          this.close();
        } catch (e) {
          console.error('Delete failed:', e);
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<span>Xóa Ngay</span>';
        }
      }
    });
  }

  public open(teamName: string, onConfirm: () => Promise<void>): void {
    const msgEl = this.overlay.querySelector('#confirm-msg') as HTMLElement;
    msgEl.innerHTML = `Bạn có chắc chắn muốn xóa <strong>${teamName}</strong>? Hành động này không làm thay đổi ID hay tên của các đội còn lại.`;
    this.onConfirmCallback = onConfirm;
    this.overlay.classList.add('active');
  }

  public close(): void {
    this.overlay.classList.remove('active');
    this.onConfirmCallback = null;
  }
}
