export type ToastType = 'success' | 'error' | 'warning' | 'info';

export class Toast {
  private static container: HTMLElement | null = null;

  private static getContainer(): HTMLElement {
    if (!this.container) {
      this.container = document.getElementById('toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 't1-toast-container';
        document.body.appendChild(this.container);
      }
    }
    return this.container;
  }

  public static show(message: string, type: ToastType = 'info', duration = 3500): void {
    const container = this.getContainer();
    const toast = document.createElement('div');
    toast.className = `t1-toast t1-pill-${type === 'info' ? 'cyan' : type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      window.setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);
  }

  public static success(message: string): void {
    this.show(message, 'success');
  }

  public static error(message: string): void {
    this.show(message, 'error');
  }

  public static warning(message: string): void {
    this.show(message, 'warning');
  }

  public static info(message: string): void {
    this.show(message, 'info');
  }
}
