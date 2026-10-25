import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BedDouble, Eye, EyeOff, Lock, Receipt, Users } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { BrandMark } from "@/components/layout/BrandMark";
import { ApiError } from "@/lib/api";
import { handleApiError } from "@/lib/errors";
import { KARMATECHLAB_URL } from "@/lib/utils";

const schema = z.object({
  username: z.string().trim().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { username: "", password: "" } });

  if (user) return <Navigate to={from && from !== "/login" ? from : "/dashboard"} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const u = await login(values.username, values.password);
      navigate(u.mustChangePassword ? "/change-password" : from && from !== "/login" ? from : "/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setFormError(err.message);
      else if (err instanceof ApiError && err.status === 429) setFormError(err.message);
      else handleApiError(err, setError);
    }
  });

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-fg lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 20% 10%, rgba(124,58,237,.45), transparent 60%), radial-gradient(ellipse 60% 50% at 90% 90%, rgba(79,70,229,.3), transparent 60%)",
          }}
          aria-hidden
        />
        <BrandMark tone="dark" size="lg" />
        <div className="relative max-w-md space-y-6">
          <h1 className="text-4xl leading-tight font-extrabold text-white">Run your PG from one calm, clear screen.</h1>
          <ul className="space-y-3 text-[15px]">
            {[
              [Users, "Tenants, rooms and beds in sync"],
              [Receipt, "Monthly rent, collections and receipts"],
              [BedDouble, "Live occupancy at a glance"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Users;
              return (
                <li key={text as string} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                    <I className="h-4 w-4 text-violet-200" aria-hidden />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-sm">
          Powered by{" "}
          <a href={KARMATECHLAB_URL} target="_blank" rel="noreferrer" className="font-semibold text-white hover:underline">
            Karmatechlab
          </a>
        </p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark size="lg" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-fg">Welcome back</h2>
          <p className="mt-1 text-sm text-fg-muted">Sign in to manage Genius Girls PG.</p>

          <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {formError}
              </div>
            )}
            <Field label="Username" required error={errors.username?.message}>
              <Input autoComplete="username" autoCapitalize="none" autoFocus {...register("username")} />
            </Field>
            <Field label="Password" required error={errors.password?.message} htmlFor="login-password">
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  aria-invalid={errors.password ? true : undefined}
                  className="pr-11"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-10 text-center text-xs text-fg-subtle lg:hidden">
            Powered by{" "}
            <a href={KARMATECHLAB_URL} target="_blank" rel="noreferrer" className="font-semibold text-primary-text hover:underline">
              Karmatechlab
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
