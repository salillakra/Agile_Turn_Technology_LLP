"use client";

import Link from "next/link";
import AuthShell from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldCheck } from "@phosphor-icons/react";

export default function RegisterPage() {
  return (
    <AuthShell>
      <Card>
        <CardHeader className="border-b pb-5">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            Invite Only
          </CardTitle>
          <CardDescription>
            Registration is invite-only for security
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            To join the recruitment workspace, you need an invite from an
            administrator. If you have received an invite email, click the link
            in that email to set up your account.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            If you need access, contact your team administrator to request an
            invite.
          </p>
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
