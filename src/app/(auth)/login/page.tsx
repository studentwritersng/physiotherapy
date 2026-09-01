import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Staff login — TetaPhysio" };

export default function StaffLoginPage() {
  return (
    <AuthForm
      title="Staff login"
      subtitle="For therapists, front desk and administrators."
      endpoint="/api/auth/login"
      submitLabel="Log in"
      fields={[
        {
          label: "Email or phone number",
          name: "identifier",
          type: "text",
          autoComplete: "username",
        },
        { label: "Password", name: "password", type: "password", autoComplete: "current-password" },
      ]}
      footer={
        <p>
          Are you a patient?{" "}
          <Link className="cursor-pointer font-medium text-jade-text underline hover:opacity-80" href="/portal/login">
            Use the patient portal
          </Link>
        </p>
      }
    />
  );
}
