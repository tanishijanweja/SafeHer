import { Button } from "@safe-her/ui/components/button";
import { Input } from "@safe-her/ui/components/input";
import { Label } from "@safe-her/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/safe-redirect";

import Loader from "./loader";

function promptToAddTrustedContacts() {
  try {
    localStorage.setItem("safeher-onboard-contacts", "1");
  } catch {
    // ignore storage access errors (private mode)
  }
}

export default function SignInForm({
  redirect = "/",
  onSwitchToSignUp,
}: {
  redirect?: string;
  onSwitchToSignUp: () => void;
}) {
  const router = useRouter();
  const { isPending } = authClient.useSession();
  const target = safeRedirect(redirect);

  const [awaitingTwoFactor, setAwaitingTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [submittingTwoFactor, setSubmittingTwoFactor] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: (data) => {
            const response = data as {
              twoFactorRedirect?: boolean;
              twoFactorMethods?: string[];
            };
            if (response.twoFactorRedirect) {
              setAwaitingTwoFactor(true);
              setTwoFactorError(null);
              return;
            }
            router.push(target as never);
            toast.success("Sign in successful");
            promptToAddTrustedContacts();
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(1, "Password is required"),
      }),
    },
  });

  const verifyTwoFactor = async () => {
    if (twoFactorCode.trim().length < 6) return;
    setSubmittingTwoFactor(true);
    setTwoFactorError(null);
    const result = await authClient.twoFactor.verifyTotp({
      code: twoFactorCode.trim(),
    });
    setSubmittingTwoFactor(false);
    if (result.error) {
      setTwoFactorError(result.error.message || "Invalid code. Try again.");
      return;
    }
    toast.success("Sign in successful");
    promptToAddTrustedContacts();
    router.push(target as never);
  };

  if (isPending) {
    return <Loader />;
  }

  if (awaitingTwoFactor) {
    return (
      <div className="mx-auto w-full mt-10 max-w-md p-6">
        <h1 className="mb-2 text-center text-3xl font-bold">Two-factor check</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Enter the 6-digit code from your authenticator app.
        </p>
        <Input
          value={twoFactorCode}
          onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          autoFocus
          aria-label="Two-factor code"
        />
        {twoFactorError ? <p className="mt-2 text-red-500">{twoFactorError}</p> : null}
        <Button
          type="button"
          className="mt-4 w-full"
          disabled={submittingTwoFactor || twoFactorCode.length < 6}
          onClick={verifyTwoFactor}
        >
          {submittingTwoFactor ? "Verifying..." : "Verify & Sign In"}
        </Button>
        <div className="mt-4 text-center">
          <Button variant="link" onClick={() => setAwaitingTwoFactor(false)} className="text-indigo-600 hover:text-indigo-800">
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full mt-10 max-w-md p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">Welcome Back</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? "Submitting..." : "Sign In"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="text-indigo-600 hover:text-indigo-800"
        >
          Need an account? Sign Up
        </Button>
      </div>
    </div>
  );
}