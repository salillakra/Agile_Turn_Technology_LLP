"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProfileCard from "@/components/profile/ProfileCard";
import { useUserProfile } from "@/hooks/queries/useUsers";
import { SpinnerGap, ArrowLeft } from "@phosphor-icons/react";

function roleLabel(role: string) {
  if (role === "HIRING_MANAGER") return "Hiring manager";
  if (role === "RECRUITER") return "Recruiter";
  if (role === "ADMIN") return "Admin";
  return role || "—";
}

export default function UserProfileViewPage() {
  const params = useParams();
  const userId = useMemo(() => (params?.id ? String(params.id) : ""), [params]);

  const { data: profile, isLoading, error } = useUserProfile(userId);

  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-sm font-semibold text-primary mb-1 uppercase tracking-wider">
            Directory
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            User profile
          </h1>
        </div>
        <Link href="/users" className="no-underline">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to users
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
          <SpinnerGap className="size-8 animate-spin mb-4" />
          <p>Loading profile...</p>
        </div>
      ) : error ? (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load profile"}
          </CardContent>
        </Card>
      ) : profile ? (
        <div className="space-y-6">
          <ProfileCard profile={profile} showStrength={false} />
          
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-6">
                Viewing is role-scoped. Contact fields are only included when allowed.
              </p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Role
                  </p>
                  <p className="text-base text-foreground font-medium">{roleLabel(profile.role)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Sign-in email
                  </p>
                  <p className="text-base text-foreground break-all">{profile.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Profile not found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
