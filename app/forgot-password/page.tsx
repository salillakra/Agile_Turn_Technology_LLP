"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { submitForgotPassword } from "@/lib/api/auth";
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
import { ArrowLeft, CheckCircle, SpinnerGap, EnvelopeSimple } from "@phosphor-icons/react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");

  const mutation = useMutation({
    mutationFn: (emailVal: string) => submitForgotPassword(emailVal.trim()),
    onSuccess: (data) => {
      if (data?.devResetUrl) setDevResetUrl(data.devResetUrl);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Something went wrong. Try again.");
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(email);
  }

  const done = mutation.isSuccess;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
      {/* Animated gradient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute -top-40 -left-40 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-primary/8 blur-3xl" />
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
              <EnvelopeSimple className="size-5 text-primary" />
            </div>
            <CardTitle className="text-base">Reset your password</CardTitle>
            <CardDescription>
              Enter your email address and we&apos;ll send you a reset link.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {mutation.isError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription className="text-xs">
                  {mutation.error?.message || "Something went wrong. Try again."}
                </AlertDescription>
              </Alert>
            )}

            {!done ? (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                </div>

                <Button type="submit" disabled={mutation.isPending} className="w-full">
                  {mutation.isPending ? (
                    <SpinnerGap data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <EnvelopeSimple data-icon="inline-start" />
                  )}
                  {mutation.isPending ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <CheckCircle className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Check your inbox</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      If an account exists for that email, you&apos;ll receive a reset
                      link shortly. We never reveal whether the email was found.
                    </p>
                  </div>
                </div>

                {devResetUrl && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                    <p className="mb-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                      Development only
                    </p>
                    <a
                      href={devResetUrl}
                      className="break-all text-xs text-blue-600 underline underline-offset-2 dark:text-blue-400"
                    >
                      {devResetUrl}
                    </a>
                  </div>
                )}
              </div>
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
