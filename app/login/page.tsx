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
import {
  WarningCircle,
  SignIn,
  SpinnerGap,
  Lightning,
} from "@phosphor-icons/react";
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

  const urlError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [expectedRole, setExpectedRole] = useState("__any__");
  const [error, setError] = useState(() => {
    if (!urlError) return "";
    if (urlError === "OAuthAccountNotLinked") {
      return "An account with this email already exists. Please sign in with your email and password to link it.";
    }
    if (urlError === "OAuthCallback") {
      return "A problem occurred while completing the sign-in with Google. Please check your network connection, verify that the client ID/secret are correct, and try again.";
    }
    return `Authentication error: ${urlError}`;
  });
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
        "Invalid email or password. If you chose a role, it must match your account.",
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

              <Field orientation="horizontal">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(checked) => setRemember(checked === true)}
                />
                <FieldLabel
                  htmlFor="remember"
                  className="cursor-pointer font-normal"
                >
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

            <div className="relative flex justify-center text-xs text-muted-foreground uppercase my-1">
              <span className="bg-background px-2">Or continue with</span>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => signIn("google", { callbackUrl })}
              disabled={loading}
            >
              <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
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
                {(["ADMIN", "RECRUITER", "HIRING_MANAGER"] as const).map(
                  (role) => (
                    <Button
                      key={role}
                      variant="outline"
                      size="sm"
                      disabled={demoLoading !== null}
                      onClick={() => !demoLoading && handleDemoLogin(role)}
                    >
                      {demoLoading === role ? (
                        <SpinnerGap
                          data-icon="inline-start"
                          className="animate-spin"
                        />
                      ) : null}
                      {role.replace("_", " ")}
                    </Button>
                  ),
                )}
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
