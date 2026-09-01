import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Patient login — TetaPhysio" };

export default function PortalLoginPage() {
  return (
    <AuthForm
      title="Patient login"
      subtitle="Manage your appointments and payments."
      endpoint="/api/auth/portal-login"
      submitLabel="Log in"
      fields={[
        {
          label: "Phone number",
          name: "phone",
          type: "tel",
          autoComplete: "tel",
          hint: "The number you gave the clinic, e.g. 08031234567",
        },
        { label: "Password", name: "password", type: "password", autoComplete: "current-password" },
      ]}
      footer={
        <p>
          New here?{" "}
          <Link className="cursor-pointer font-medium text-jade-text underline hover:opacity-80" href="/portal/register">
            Create an account
          </Link>
        </p>
      }
    />
  );
}
