import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // No background here — the body's radial gradient wash provides the layered
  // ground the glass card floats on. The toggle sits in the top-right so the
  // theme choice is reachable before signing in.
  return (
    <div className="flex min-h-screen flex-col px-4 py-6">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center py-6">{children}</div>
    </div>
  );
}
