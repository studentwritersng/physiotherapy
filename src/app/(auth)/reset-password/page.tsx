import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/server/auth/rbac";

export const metadata = { title: "Change your password — TetaPhysio" };

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AuthForm
      title="Choose a new password"
      subtitle={
        user.mustResetPassword
          ? "Your account was created with a temporary password. Set your own to continue."
          : "Update the password on your account."
      }
      endpoint="/api/auth/change-password"
      submitLabel="Save password"
      fields={[
        {
          label: "Current password",
          name: "currentPassword",
          type: "password",
          autoComplete: "current-password",
        },
        {
          label: "New password",
          name: "newPassword",
          type: "password",
          autoComplete: "new-password",
          hint: "At least 8 characters, including a number",
        },
      ]}
    />
  );
}
