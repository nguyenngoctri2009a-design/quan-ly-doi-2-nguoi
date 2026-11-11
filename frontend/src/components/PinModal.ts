export class PinModal {
  private overlay: HTMLElement;
  private onConfirmCallback: (() => Promise<void>) | null = null;
  private correctPin = '2000';

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 't1-modal-overlay';
    this.render();
    document.body.appendChild(this.overlay);
    this.bindEvents();
  }

  private render(): void {
    this.overlay.innerHTML = `
      <div class="t1-modal-box" style="max-width: 420px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 10px;">🔒</div>
        <h3 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 900; color: var(--t1-text);">
          Xác Nhận Kết Thúc Giải Đấu
        </h3>
        <p style="margin: 0 0 20px 0; font-size: 13px; color: var(--t1-text-muted); font-weight: 600;">
          Vui lòng nhập Mã PIN Ban Tổ Chức để hoàn tất và kết thúc giải đấu.
        </p>

        <form id="pin-form">
          <div class="form-group" style="margin-bottom: 20px;">
            <input
              type="password"
              id="input-pin-code"
              class="t1-input"
              placeholder="Nhập mã PIN (4 số)..."
              maxlength="4"
              pattern="[0-9]*"
              style="text-align: center; font-size: 24px; font-weight: 900; letter-spacing: 8px;"
              autocomplete="off"
            />
            <div id="pin-error-msg" style="display: none; color: #dc2626; font-size: 12.5px; font-weight: 750; margin-top: 8px;">
              ❌ Mã PIN không chính xác!
            </div>
          </div>

          <div style="display: flex; justify-content: center; gap: 12px;">
            <button type="button" class="t1-btn t1-btn-secondary" id="btn-cancel-pin">
              Hủy Bỏ
            </button>
            <button type="submit" class="t1-btn t1-btn-danger" id="btn-submit-pin">
              <span>Xác Nhận Kết Thúc</span>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  private bindEvents(): void {
    const cancelBtn = this.overlay.querySelector('#btn-cancel-pin');
    cancelBtn?.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    const form = this.overlay.querySelector('#pin-form') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleVerify();
    });

    const pinInput = this.overlay.querySelector('#input-pin-code') as HTMLInputElement;
    pinInput?.addEventListener('input', () => {
      pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4);
      const err = this.overlay.querySelector('#pin-error-msg') as HTMLElement;
      if (err) err.style.display = 'none';
    });
  }

  public open(onSuccess: () => Promise<void>): void {
    this.onConfirmCallback = onSuccess;
    const pinInput = this.overlay.querySelector('#input-pin-code') as HTMLInputElement;
    const err = this.overlay.querySelector('#pin-error-msg') as HTMLElement;
    if (pinInput) pinInput.value = '';
    if (err) err.style.display = 'none';

    this.overlay.classList.add('active');
    setTimeout(() => pinInput?.focus(), 100);
  }

  public close(): void {
    this.overlay.classList.remove('active');
    this.onConfirmCallback = null;
  }

  private async handleVerify(): Promise<void> {
    const pinInput = this.overlay.querySelector('#input-pin-code') as HTMLInputElement;
    const err = this.overlay.querySelector('#pin-error-msg') as HTMLElement;
    const submitBtn = this.overlay.querySelector('#btn-submit-pin') as HTMLButtonElement;

    const entered = pinInput.value.trim();
    if (entered !== this.correctPin) {
      if (err) {
        err.textContent = '❌ Mã PIN không chính xác! Vui lòng nhập mã PIN hợp lệ.';
        err.style.display = 'block';
      }
      pinInput.value = '';
      pinInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Đang xác nhận...</span>';

    try {
      if (this.onConfirmCallback) {
        await this.onConfirmCallback();
      }
      this.close();
    } catch (e) {
      if (err) {
        err.textContent = `Lỗi: ${e instanceof Error ? e.message : String(e)}`;
        err.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Xác Nhận Kết Thúc</span>';
    }
  }
}
