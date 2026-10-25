import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { BrandMark } from "@/components/layout/BrandMark";
import { authApi } from "@/services/api";
import { handleApiError } from "@/lib/errors";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(6, "Use at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a different password" });
type Values = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });

  const onSubmit = handleSubmit(async (v) => {
    try {
      await authApi.changePassword(v.currentPassword, v.newPassword);
      await refreshUser();
      toast.success("Password updated");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <BrandMark size="lg" />
        <Card className="p-6">
          <h1 className="text-xl font-extrabold text-fg">Set a new password</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {user?.mustChangePassword ? "For security, please replace your temporary password." : "Update the password for your account."}
          </p>
          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <Field label="Current password" required error={errors.currentPassword?.message}>
              <Input type="password" autoComplete="current-password" {...register("currentPassword")} />
            </Field>
            <Field label="New password" required error={errors.newPassword?.message}>
              <Input type="password" autoComplete="new-password" {...register("newPassword")} />
            </Field>
            <Field label="Confirm new password" required error={errors.confirmPassword?.message}>
              <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
            </Field>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              {user?.mustChangePassword ? (
                <Button variant="ghost" onClick={() => void logout()}>
                  Sign out
                </Button>
              ) : (
                <Button variant="outline" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              )}
              <Button type="submit" loading={isSubmitting}>
                Update password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
