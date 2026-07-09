"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthShell from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { SpinnerGap, UserPlus, WarningCircle, CheckCircle } from "@phosphor-icons/react";

function roleLabel(role: string): string {
  if (role === "HIRING_MANAGER") return "Hiring Manager";
  if (role === "RECRUITER") return "Recruiter";
  if (role === "ADMIN") return "Admin";
  return role;
}

type InviteInfo = {
  valid: boolean;
  email?: string;
  role?: string;
  reason?: string;
};

function InvitePageInner({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState("");

  const fetchInvite = useCallback(async () => {
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}`);
      const data = await res.json();
      setInvite(data);
    } catch {
      setInvite({ valid: false, reason: "Failed to verify invite. Please try again." });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvite();
  }, [fetchInvite]);

  const acceptMutation = useMutation({
    mutationFn: async (payload: { name: string; password: string }) => {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create account.");
      return data;
    },
    onSuccess: () => {
      toast.success("Account created! Please sign in.");
      router.push("/login");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Account creation failed.");
    },
  });

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError("");

    if (password !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters.");
      return;
    }

    acceptMutation.mutate({ name: name.trim(), password });
  }

  const error = validationError || (acceptMutation.isError ? acceptMutation.error?.message : "");

  if (loading) {
    return (
      <AuthShell>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  if (!invite?.valid) {
    return (
      <AuthShell>
        <Card>
          <CardHeader className="border-b pb-5">
            <CardTitle className="flex items-center gap-2">
              <WarningCircle className="size-5 text-destructive" />
              Invalid Invite
            </CardTitle>
            <CardDescription>
              {invite?.reason || "This invite link is no longer valid."}
            </CardDescription>
          </CardHeader>
          <CardFooter className="pt-5">
            <div className="flex flex-col gap-3 w-full">
              <p className="text-sm text-muted-foreground">
                Contact your administrator for a new invite link.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  Go to Sign In
                </Button>
              </Link>
            </div>
          </CardFooter>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader className="border-b pb-5">
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="size-5 text-green-600 dark:text-green-400" />
            Accept Invite
          </CardTitle>
          <CardDescription>
            Set up your account to join the team
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input
                  type="email"
                  value={invite.email || ""}
                  disabled
                  className="bg-muted"
                />
              </Field>

              <Field>
                <FieldLabel>Role</FieldLabel>
                <div>
                  <Badge variant="outline" className="text-sm px-3 py-1">
                    {roleLabel(invite.role || "")}
                  </Badge>
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="name">Full name</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Your name"
                  disabled={acceptMutation.isPending}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  disabled={acceptMutation.isPending}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  disabled={acceptMutation.isPending}
                />
              </Field>
            </FieldGroup>

            <Button type="submit" disabled={acceptMutation.isPending} className="w-full">
              {acceptMutation.isPending ? (
                <SpinnerGap data-icon="inline-start" className="animate-spin" />
              ) : (
                <UserPlus data-icon="inline-start" />
              )}
              {acceptMutation.isPending ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center border-t">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  if (!token) {
    return (
      <AuthShell>
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return <InvitePageInner token={token} />;
}
