"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { submitResetPassword } from "@/lib/api/auth";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, Key, SpinnerGap } from "@phosphor-icons/react";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [validationError, setValidationError] = useState("");

  const mutation = useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      submitResetPassword(token, password),
    onSuccess: () => {
      toast.success("Password updated! Redirecting to sign in…");
      setTimeout(() => router.push("/login"), 2000);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Reset failed.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError("");

    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setValidationError("Passwords do not match.");
      return;
    }
    if (!token) {
      setValidationError("Missing reset token. Open the link from your email again.");
      return;
    }
    mutation.mutate({ token, password });
  }

  const error = validationError || (mutation.isError ? mutation.error?.message : "");

  if (!token && !mutation.isSuccess) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-background" />
        </div>
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-sm shadow-xl">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              Invalid or missing reset link.
            </p>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Request a new link
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
      {/* Animated gradient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute -top-40 -right-40 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 size-96 rounded-full bg-primary/8 blur-3xl" />
      </div>

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-sm font-bold tracking-tight shadow-lg shadow-primary/25">
            AT
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Agile Turn Technology
            </h1>
            <p className="text-sm text-muted-foreground">Recruitment Suite</p>
          </div>
        </div>

        <Card className="shadow-xl shadow-black/5 border-muted/60">
          <CardHeader className="pb-4">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <Key className="size-5 text-primary" />
            </div>
            <CardTitle className="text-base">Set new password</CardTitle>
            <CardDescription>
              Choose a strong password at least 8 characters long.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {mutation.isSuccess ? (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <CheckCircle className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Password updated!</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Redirecting to sign in…
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                </div>

                <Button type="submit" disabled={mutation.isPending} className="w-full">
                  {mutation.isPending ? (
                    <SpinnerGap data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Key data-icon="inline-start" />
                  )}
                  {mutation.isPending ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}

            <Link
              href="/login"
              className="mt-5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-64 w-80 rounded-xl bg-muted animate-pulse" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
