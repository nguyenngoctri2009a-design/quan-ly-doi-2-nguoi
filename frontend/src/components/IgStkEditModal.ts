export class IgStkEditModal {
  private overlay: HTMLElement | null = null;
  private onSaveCallback: ((ig: string, stk: string) => Promise<void>) | null = null;

  constructor() {
    this.createModalDOM();
  }

  private createModalDOM(): void {
    const existing = document.getElementById('ig-stk-edit-modal-overlay');
    if (existing) existing.remove();

    this.overlay = document.createElement('div');
    this.overlay.id = 'ig-stk-edit-modal-overlay';
    this.overlay.className = 't1-modal-overlay';
    this.overlay.style.display = 'none';

    this.overlay.innerHTML = `
      <div class="t1-modal-card" style="max-width: 480px; width: 90%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 26px;">✏️</span>
            <h3 style="margin: 0; font-size: 19px; font-weight: 900; color: var(--t1-text);">
              Sửa Thông Tin IG – STK
            </h3>
          </div>
          <button type="button" class="btn-close-modal" id="btn-close-ig-edit" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #94a3b8;">✕</button>
        </div>

        <form id="form-edit-ig-stk">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="edit-input-ig">TÊN INSTAGRAM (IG)</label>
            <input
              type="text"
              id="edit-input-ig"
              class="t1-input"
              placeholder="VD: Adam John..."
              required
              maxlength="60"
            />
          </div>

          <div class="form-group" style="margin-bottom: 20px;">
            <label class="form-label" for="edit-input-stk">SỐ TÀI KHOẢN (STK)</label>
            <input
              type="text"
              id="edit-input-stk"
              class="t1-input stk-input"
              placeholder="VD: 497077..."
              required
              maxlength="15"
            />
          </div>

          <div id="edit-ig-stk-error" style="display: none; margin-bottom: 16px; padding: 10px 14px; border-radius: 10px; background: #fee2e2; color: #991b1b; font-size: 13px; font-weight: 700;"></div>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
            <button type="button" class="t1-btn t1-btn-secondary" id="btn-cancel-ig-edit">
              Hủy Bỏ
            </button>
            <button type="submit" class="t1-btn t1-btn-primary" id="btn-submit-ig-edit" style="padding: 10px 24px;">
              <span>💾 Lưu Thay Đổi</span>
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(this.overlay);

    const closeBtn = document.getElementById('btn-close-ig-edit');
    const cancelBtn = document.getElementById('btn-cancel-ig-edit');
    const form = document.getElementById('form-edit-ig-stk') as HTMLFormElement;

    closeBtn?.addEventListener('click', () => this.close());
    cancelBtn?.addEventListener('click', () => this.close());

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const igInp = document.getElementById('edit-input-ig') as HTMLInputElement;
      const stkInp = document.getElementById('edit-input-stk') as HTMLInputElement;
      const errBox = document.getElementById('edit-ig-stk-error') as HTMLElement;
      const submitBtn = document.getElementById('btn-submit-ig-edit') as HTMLButtonElement;

      const ig = igInp?.value.trim();
      const stk = stkInp?.value.trim();

      if (!ig) {
        errBox.textContent = 'Vui lòng nhập tên IG!';
        errBox.style.display = 'block';
        return;
      }
      if (!stk) {
        errBox.textContent = 'Vui lòng nhập số STK!';
        errBox.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Đang lưu...</span>';
      errBox.style.display = 'none';

      try {
        if (this.onSaveCallback) {
          await this.onSaveCallback(ig, stk);
        }
        this.close();
      } catch (err) {
        errBox.textContent = err instanceof Error ? err.message : String(err);
        errBox.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>💾 Lưu Thay Đổi</span>';
      }
    });
  }

  public open(currentIg: string, currentStk: string, onSave: (ig: string, stk: string) => Promise<void>): void {
    this.onSaveCallback = onSave;
    const igInp = document.getElementById('edit-input-ig') as HTMLInputElement;
    const stkInp = document.getElementById('edit-input-stk') as HTMLInputElement;
    const errBox = document.getElementById('edit-ig-stk-error') as HTMLElement;

    if (igInp) igInp.value = currentIg;
    if (stkInp) stkInp.value = currentStk;
    if (errBox) errBox.style.display = 'none';

    if (this.overlay) {
      this.overlay.style.display = 'flex';
      setTimeout(() => igInp?.focus(), 100);
    }
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    this.onSaveCallback = null;
  }
}
