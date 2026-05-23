import { Header } from "./Header";
import { NavBar } from "./NavBar";
import { SubNav } from "./SubNav";
import { ContentArea } from "./ContentArea";
import { CommandPalette } from "../components/CommandPalette";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col bg-[var(--color-canvas)]">
      <Header />
      <div className="flex-1 flex min-h-0">
        <NavBar />
        <SubNav />
        <ContentArea>{children}</ContentArea>
      </div>
      <CommandPalette />
    </div>
  );
}
