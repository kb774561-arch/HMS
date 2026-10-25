import { toast } from "sonner";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "./api";

/**
 * One place that turns an API failure into UI feedback. Forms stay open and keep
 * their values; only a genuinely ended session (handled in api.ts) leads to sign-in.
 */
export function handleApiError<T extends FieldValues>(err: unknown, setError?: UseFormSetError<T>) {
  if (!(err instanceof ApiError)) {
    toast.error("Something went wrong. Please try again.");
    return;
  }

  if (err.isValidation && err.fieldErrors && setError) {
    let focused = false;
    for (const [field, message] of Object.entries(err.fieldErrors)) {
      setError(field as Path<T>, { type: "server", message }, { shouldFocus: !focused });
      focused = true;
    }
    toast.error(err.message || "Please correct the highlighted fields");
    return;
  }

  switch (err.status) {
    case 401:
      // Session-ended 401s are announced by AuthProvider; other 401s are plain messages.
      if (err.code === "INVALID_CREDENTIALS") toast.error(err.message);
      return;
    case 403:
      toast.error("Permission denied", { description: err.message });
      return;
    case 0:
      toast.error("You're offline", { description: err.message });
      return;
    case 503:
      toast.error("Database unavailable", { description: err.message });
      return;
    default:
      if (err.status >= 500) toast.error("Server error", { description: err.message });
      else toast.error(err.message);
  }
}
