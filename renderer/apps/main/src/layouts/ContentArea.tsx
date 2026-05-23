import { Toolbar } from "./Toolbar";

interface ContentAreaProps {
  children: React.ReactNode;
}

export function ContentArea({ children }: ContentAreaProps) {
  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Toolbar />
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </main>
  );
}
