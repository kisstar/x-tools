// 纯 DOM 拖拽分栏，零框架依赖：只读写目标元素自身的一个 CSS 变量。
// 变量写在读它的那个元素上（配合 global.css 里 @property 的 inherits: false），
// 所以拖拽既不触发框架重渲染，也不会让兄弟子树跟着进 style recalc。
// 默认宽度只有 @property 的 initial-value 一处真源，双击复位即回到它。
// ponytail: 现在只有一个消费者（AppShell），先放在 app 内；第二个宿主需要时再提到 packages。

type SplitterAxis = "x" | "y";

interface SplitterOptions {
  /** 变量写在这个元素上，它自己用 var() 读取尺寸 */
  readonly container: HTMLElement;
  /** 变量名，例如 "--pane-subnav"，需在 global.css 用 @property 注册默认值 */
  readonly varName: string;
  /** x = 左右分栏（拖动改宽度），y = 上下分栏（拖动改高度） */
  readonly axis?: SplitterAxis;
  readonly min?: number;
  readonly max?: number;
  /** 给了就持久化到 localStorage */
  readonly storageKey?: string;
}

interface AxisSpec {
  readonly orientation: "vertical" | "horizontal";
  readonly cursor: string;
  readonly decreaseKey: string;
  readonly increaseKey: string;
  readonly handleClass: string;
  readonly pointerPos: (event: PointerEvent) => number;
}

/** 尺寸模型：唯一持有当前值，拖拽期间只改 CSS 变量，落盘另算。 */
interface PaneSize {
  readonly get: () => number;
  /** 夹取到 [min, max] 后写入 CSS 变量 */
  readonly set: (size: number) => void;
  /** 删掉内联值，回到 @property 的默认尺寸 */
  readonly reset: () => void;
  readonly persist: () => void;
}

const KEY_STEP = 16;

const HANDLE_CLASS_BASE =
  "relative shrink-0 bg-hairline outline-none transition-colors hover:bg-primary focus-visible:bg-primary after:absolute after:content-['']";

/** 两个轴向只在这一张表里分叉，其余逻辑共用。 */
const SPLITTER_AXIS: Record<SplitterAxis, AxisSpec> = {
  x: {
    orientation: "vertical",
    cursor: "col-resize",
    decreaseKey: "ArrowLeft",
    increaseKey: "ArrowRight",
    handleClass: `${HANDLE_CLASS_BASE} w-px cursor-col-resize after:inset-y-0 after:-left-1 after:-right-1`,
    pointerPos: (event) => event.clientX,
  },
  y: {
    orientation: "horizontal",
    cursor: "row-resize",
    decreaseKey: "ArrowUp",
    increaseKey: "ArrowDown",
    handleClass: `${HANDLE_CLASS_BASE} h-px cursor-row-resize after:inset-x-0 after:-top-1 after:-bottom-1`,
    pointerPos: (event) => event.clientY,
  },
};

function parseSize(raw: string | null): number | undefined {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface PaneSizeOptions {
  readonly container: HTMLElement;
  readonly varName: string;
  readonly min: number;
  readonly max: number;
  readonly storageKey: string | undefined;
}

function createPaneSize({ container, varName, min, max, storageKey }: PaneSizeOptions): PaneSize {
  // 只在创建时读一次计算样式拿到 @property 默认值；之后尺寸全走闭包，不再回读 DOM。
  const fallback = parseSize(getComputedStyle(container).getPropertyValue(varName)) ?? min;
  let current = fallback;

  const set = (size: number): void => {
    current = Math.min(Math.max(size, min), max);
    container.style.setProperty(varName, `${current}px`);
  };

  const stored = storageKey ? parseSize(window.localStorage.getItem(storageKey)) : undefined;
  if (stored !== undefined) set(stored);

  return {
    get: () => current,
    set,
    reset: () => {
      container.style.removeProperty(varName);
      current = fallback;
      if (storageKey) window.localStorage.removeItem(storageKey);
    },
    persist: () => {
      if (storageKey) window.localStorage.setItem(storageKey, String(current));
    },
  };
}

function setBodyDragging(cursor: string | undefined): void {
  if (cursor === undefined) {
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
    return;
  }
  document.body.style.userSelect = "none";
  document.body.style.cursor = cursor;
}

/** 一次拖拽会话：所有 document 级监听都挂在返回的 controller 上，abort 即全部摘除。 */
function startDrag(
  event: PointerEvent,
  spec: AxisSpec,
  size: PaneSize,
  onFinish: () => void,
): AbortController {
  event.preventDefault();
  const originPos = spec.pointerPos(event);
  const originSize = size.get();
  const drag = new AbortController();
  const { signal } = drag;

  const finish = (): void => {
    drag.abort();
    setBodyDragging(undefined);
    onFinish();
  };

  document.addEventListener(
    "pointermove",
    (move: PointerEvent) => size.set(originSize + spec.pointerPos(move) - originPos),
    { signal },
  );
  document.addEventListener("pointerup", finish, { signal });
  document.addEventListener("pointercancel", finish, { signal });
  setBodyDragging(spec.cursor);
  return drag;
}

/** 把 handle 元素变成可拖拽分隔条，返回卸载函数。 */
function attachSplitter(handle: HTMLElement, options: SplitterOptions): () => void {
  const { container, varName, axis = "x", min = 120, max = 480, storageKey } = options;
  const spec = SPLITTER_AXIS[axis];
  const size = createPaneSize({ container, varName, min, max, storageKey });

  const setValueNow = (): void =>
    handle.setAttribute("aria-valuenow", String(Math.round(size.get())));

  /** 落盘与无障碍树更新只在手势结束时做一次，不逐帧。 */
  const commit = (): void => {
    setValueNow();
    size.persist();
  };

  let drag: AbortController | undefined;

  const onPointerDown = (event: PointerEvent): void => {
    drag = startDrag(event, spec, size, commit);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== spec.increaseKey && event.key !== spec.decreaseKey) return;
    event.preventDefault();
    size.set(size.get() + (event.key === spec.increaseKey ? KEY_STEP : -KEY_STEP));
    commit();
  };

  const onDoubleClick = (): void => {
    size.reset();
    setValueNow();
  };

  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", spec.orientation);
  handle.setAttribute("aria-valuemin", String(min));
  handle.setAttribute("aria-valuemax", String(max));
  handle.tabIndex = 0;
  setValueNow();

  const teardown = new AbortController();
  const { signal } = teardown;
  handle.addEventListener("pointerdown", onPointerDown, { signal });
  handle.addEventListener("keydown", onKeyDown, { signal });
  handle.addEventListener("dblclick", onDoubleClick, { signal });

  return () => {
    drag?.abort();
    setBodyDragging(undefined);
    teardown.abort();
  };
}

export { attachSplitter, SPLITTER_AXIS };
export type { SplitterAxis, SplitterOptions };
