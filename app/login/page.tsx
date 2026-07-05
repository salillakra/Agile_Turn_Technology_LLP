"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchDemoLoginConfig } from "@/lib/api/auth";
import apiClient from "@/lib/axios";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { WarningCircle, SignIn, SpinnerGap, Lightning } from "@phosphor-icons/react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { themeConfig } from "@/lib/theme";

const ROLE_OPTIONS = [
  { value: "__any__", label: "Any role (default)" },
  { value: "ADMIN", label: "Admin" },
  { value: "RECRUITER", label: "Recruiter" },
  { value: "HIRING_MANAGER", label: "Hiring Manager" },
] as const;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [expectedRole, setExpectedRole] = useState("__any__");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);

  const { data: demoConfig } = useQuery({
    queryKey: ["demo-login-config"],
    queryFn: fetchDemoLoginConfig,
    retry: false,
  });
  const demoEnabled = !!demoConfig?.demoLoginEnabled;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      remember: remember ? "true" : "false",
      expectedRole: expectedRole === "__any__" ? "" : expectedRole,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (res?.error) {
      setError(
        "Invalid email or password. If you chose a role, it must match your account."
      );
      return;
    }
    if (res?.ok) router.push(callbackUrl);
  }

  async function handleDemoLogin(role: string) {
    setError("");
    setDemoLoading(role);
    try {
      await apiClient.post("/auth/demo-login", { role });
      router.push(callbackUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Demo login failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader className="border-b pb-5">
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Access your {themeConfig.brand.tagline.toLowerCase()} workspace
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error ? (
              <Alert variant="destructive">
                <WarningCircle />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </Field>

              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter password"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="role-select">
                  Sign in as role{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Select value={expectedRole} onValueChange={setExpectedRole}>
                  <SelectTrigger id="role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Role must match your account or sign-in will fail.
                </p>
              </Field>

              <Field orientation="horizontal">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(checked) => setRemember(checked === true)}
                />
                <FieldLabel htmlFor="remember" className="cursor-pointer font-normal">
                  Remember me
                </FieldLabel>
              </Field>
            </FieldGroup>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <SpinnerGap data-icon="inline-start" className="animate-spin" />
              ) : (
                <SignIn data-icon="inline-start" />
              )}
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>

        {demoEnabled ? (
          <>
            <Separator />
            <CardContent className="pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <Lightning />
                Quick sign-in (demo)
              </p>
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                First user per role. Requires{" "}
                <code className="rounded-sm border border-border bg-muted px-1 py-0.5 text-[11px] text-foreground">
                  ENABLE_DEMO_AUTH=true
                </code>
                .
              </p>
              <div className="flex flex-wrap gap-2">
                {(["ADMIN", "RECRUITER", "HIRING_MANAGER"] as const).map((role) => (
                  <Button
                    key={role}
                    variant="outline"
                    size="sm"
                    disabled={demoLoading !== null}
                    onClick={() => !demoLoading && handleDemoLogin(role)}
                  >
                    {demoLoading === role ? (
                      <SpinnerGap data-icon="inline-start" className="animate-spin" />
                    ) : null}
                    {role.replace("_", " ")}
                  </Button>
                ))}
              </div>
            </CardContent>
          </>
        ) : null}

        <CardFooter className="justify-center border-t">
          <p className="text-sm text-muted-foreground">
            No account?{" "}
            <Link
              href="/register"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Create account
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        </AuthShell>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
