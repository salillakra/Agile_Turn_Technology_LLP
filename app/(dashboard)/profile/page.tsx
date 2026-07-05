"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import ProfileCard from "@/components/profile/ProfileCard";
import EditProfileForm from "@/components/profile/EditProfileForm";
import EmailPreferencesCard from "@/components/profile/EmailPreferencesCard";
import {
  useProfile,
  useUpdateProfile,
  useUploadAvatar,
  useChangePassword,
} from "@/hooks/queries/useProfile";
import { cn } from "@/lib/utils";

const PROFILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal" },
  { id: "email", label: "Email" },
  { id: "account", label: "Account" },
] as const;

type ProfileTab = (typeof PROFILE_TABS)[number]["id"];

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export default function ProfilePage() {
  const { data: profile, isLoading: loading, error } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const changePassword = useChangePassword();

  const [tab, setTab] = useState<ProfileTab>("overview");
  const [pw, setPw] = useState({ current: "", next: "", next2: "" });
  const [pwMsg, setPwMsg] = useState({ err: "", ok: "" });

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarErr, setAvatarErr] = useState("");

  const isAdmin = profile?.role === "ADMIN";

  useEffect(() => {
    if (!profile) return;
    const ids = PROFILE_TABS.map((t) => t.id);
    if (!ids.includes(tab)) setTab(ids[0]);
  }, [profile, tab]);

  const onAvatarPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setAvatarErr("");
    },
    [avatarPreview]
  );

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const submitAvatar = async () => {
    const input = avatarInputRef.current;
    const file = avatarFile;
    if (!file) {
      setAvatarErr("Choose an image first.");
      return;
    }
    setAvatarErr("");
    try {
      await uploadAvatar.mutateAsync(file);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
      setAvatarFile(null);
      if (input) input.value = "";
    } catch (err) {
      setAvatarErr(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const submitPassword = async () => {
    setPwMsg({ err: "", ok: "" });
    if (pw.next.length < 8) {
      setPwMsg({ err: "New password must be at least 8 characters.", ok: "" });
      return;
    }
    if (pw.next !== pw.next2) {
      setPwMsg({ err: "New password and confirmation do not match.", ok: "" });
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: "", next: "", next2: "" });
      setPwMsg({ err: "", ok: "Password updated successfully." });
    } catch (err) {
      setPwMsg({ err: err instanceof Error ? err.message : "Failed", ok: "" });
    }
  };

  if (loading && !profile) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-8">
        <div className="space-y-3 border-b border-border pb-6">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="flex flex-col gap-8 lg:flex-row">
          <Skeleton className="h-48 w-full lg:w-52" />
          <Skeleton className="h-80 flex-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl">
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        description="Manage your profile, contact email, and security settings. Sign-in email and role are managed by your administrator."
      />

      {error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load profile"}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex min-w-0 flex-col gap-8 lg:flex-row lg:items-start">
        <nav className="flex w-full min-w-0 max-w-full shrink-0 flex-row gap-1 overflow-x-auto overscroll-x-contain rounded-lg border border-border bg-card p-1 lg:w-52 lg:max-w-[13rem] lg:flex-col lg:overflow-visible">
          {PROFILE_TABS.map((t) => (
            <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </TabButton>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {tab === "overview" ? <ProfileCard profile={profile} /> : null}

          {tab === "personal" ? (
            <div className="space-y-6">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Profile photo</CardTitle>
                  <CardDescription>JPEG, PNG, or WebP — max 2MB.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-start gap-6">
                    <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-sm text-muted-foreground">
                      {avatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarPreview} alt="" className="size-full object-cover" />
                      ) : profile?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile.image} alt="" className="size-full object-cover" />
                      ) : (
                        "No photo"
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                      <Input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="cursor-pointer file:cursor-pointer"
                        disabled={uploadAvatar.isPending}
                        onChange={onAvatarPick}
                      />
                      {avatarErr ? <p className="text-sm text-destructive">{avatarErr}</p> : null}
                      <Button
                        variant="secondary"
                        disabled={uploadAvatar.isPending || !avatarFile}
                        onClick={() => void submitAvatar()}
                        className="w-fit"
                      >
                        {uploadAvatar.isPending ? "Uploading..." : "Upload photo"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <EditProfileForm
                profile={profile}
                isAdmin={isAdmin}
                variant="personal"
                onSave={async (payload) => {
                  await updateProfile.mutateAsync(payload);
                }}
              />
            </div>
          ) : null}

          {tab === "email" ? (
            <div className="space-y-6">
              <EditProfileForm
                profile={profile}
                isAdmin={isAdmin}
                variant="email"
                onSave={async (payload) => {
                  await updateProfile.mutateAsync(payload);
                }}
              />
              <EmailPreferencesCard />
            </div>
          ) : null}

          {tab === "account" ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Change password</CardTitle>
                <CardDescription>Use at least 8 characters for your new password.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {pwMsg.err ? (
                  <Alert variant="destructive">
                    <AlertDescription>{pwMsg.err}</AlertDescription>
                  </Alert>
                ) : null}
                {pwMsg.ok ? (
                  <Alert>
                    <AlertDescription>{pwMsg.ok}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="max-w-md space-y-4">
                  <div className="space-y-2">
                    <Label>Current password</Label>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={pw.current}
                      onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>New password</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={pw.next}
                      onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm new password</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={pw.next2}
                      onChange={(e) => setPw((p) => ({ ...p, next2: e.target.value }))}
                    />
                  </div>
                  <Button onClick={() => void submitPassword()} disabled={changePassword.isPending}>
                    {changePassword.isPending ? "Updating..." : "Update password"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
