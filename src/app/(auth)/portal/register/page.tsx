import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create an account — TetaPhysio" };

export default function PortalRegisterPage() {
  return (
    <AuthForm
      title="Create your account"
      subtitle="Use the same phone number you gave at the clinic — staff will link your records after you register."
      endpoint="/api/auth/register"
      submitLabel="Create account"
      fields={[
        { label: "Full name", name: "fullName", type: "text", autoComplete: "name" },
        {
          label: "Phone number",
          name: "phone",
          type: "tel",
          autoComplete: "tel",
          hint: "e.g. 08031234567",
        },
        { label: "Email", name: "email", type: "email", autoComplete: "email", required: true },
        {
          label: "Password",
          name: "password",
          type: "password",
          autoComplete: "new-password",
          hint: "At least 8 characters, including a number",
        },
      ]}
      footer={
        <p>
          Already have an account?{" "}
          <Link className="cursor-pointer font-medium text-jade-text underline hover:opacity-80" href="/portal/login">
            Log in
          </Link>
        </p>
      }
    />
  );
}
