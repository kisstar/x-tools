import { useLayoutEffect, useRef } from "react";

import { attachSplitter, SPLITTER_AXIS, type SplitterOptions } from "./pane-splitter";

interface PaneSplitterProps extends Omit<SplitterOptions, "container"> {
  /** 承载 CSS 变量的元素，也就是被拖动改尺寸的那个分栏本身 */
  readonly containerRef: React.RefObject<HTMLElement | null>;
}

/** React 侧只负责渲染分隔条并挂载纯 DOM 逻辑，拖拽过程完全不触发重渲染。 */
function PaneSplitter({ containerRef, ...options }: PaneSplitterProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const { varName, axis = "x", min, max, storageKey } = options;

  // useLayoutEffect：在首帧绘制前写入已存尺寸，避免从默认值跳变。
  useLayoutEffect(() => {
    const handle = handleRef.current;
    const container = containerRef.current;
    if (!handle || !container) return;
    return attachSplitter(handle, { ...options, container });
    // 依赖列的是 options 的每个字段（对象本身每次渲染都是新引用，不能直接进依赖）。
  }, [containerRef, varName, axis, min, max, storageKey]);

  return <div ref={handleRef} className={SPLITTER_AXIS[axis].handleClass} />;
}

export { PaneSplitter };
