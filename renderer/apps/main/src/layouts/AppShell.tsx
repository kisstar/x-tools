import { useRef } from "react";

import { Header } from "./Header";
import { NavBar } from "./NavBar";
import { SubNav } from "./SubNav";
import { ContentArea } from "./ContentArea";
import { CommandPalette } from "../components/CommandPalette";
import { PaneSplitter } from "../components/PaneSplitter";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navBarRef = useRef<HTMLElement>(null);
  const subNavRef = useRef<HTMLElement>(null);

  return (
    <div className="h-screen flex flex-col bg-[var(--color-canvas)]">
      <Header />
      <div className="flex-1 flex min-h-0">
        <NavBar ref={navBarRef} />
        <PaneSplitter
          containerRef={navBarRef}
          varName="--pane-nav"
          min={48}
          max={120}
          storageKey="x-tools-pane-nav"
        />
        <SubNav ref={subNavRef} />
        <PaneSplitter
          containerRef={subNavRef}
          varName="--pane-subnav"
          min={160}
          max={420}
          storageKey="x-tools-pane-subnav"
        />
        <ContentArea>{children}</ContentArea>
      </div>
      <CommandPalette />
    </div>
  );
}
