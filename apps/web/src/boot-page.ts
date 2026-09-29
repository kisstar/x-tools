export class BootPage {
  private readonly element = document.createElement('div')
  constructor(private readonly container: HTMLElement) { this.element.dataset.xtBoot = ''; this.element.textContent = '正在加载插件…'; container.append(this.element) }
  fail(moduleId: string, reason: unknown): void { this.element.textContent = `${moduleId}: ${reason instanceof Error ? reason.message : String(reason)}` }
  dispose(): void { this.element.remove() }
}
