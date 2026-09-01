export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // No background here — the body's radial gradient wash provides it.
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">{children}</div>
  );
}
