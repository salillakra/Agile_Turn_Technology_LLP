"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function EditProfileForm({
  profile,
  isAdmin,
  onSave,
  variant = "personal",
  extraActions,
}: {
  profile: any;
  isAdmin: boolean;
  onSave: (payload: any) => Promise<void>;
  variant?: "personal" | "email";
  extraActions?: React.ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [form, setForm] = useState({
    name: "",
    image: "",
    phone: "",
    personalEmail: "",
    jobTitle: "",
    department: "",
    location: "",
    bio: "",
    timezone: "",
  });

  useEffect(() => {
    if (!profile) return;
    const pr = profile.profile || {};
    setForm({
      name: profile.name || "",
      image: profile.image || "",
      phone: pr.phone || "",
      personalEmail: pr.personalEmail || "",
      jobTitle: pr.jobTitle || "",
      department: pr.department || "",
      location: pr.location || "",
      bio: pr.bio || "",
      timezone: pr.timezone || "",
    });
  }, [profile]);

  const submit = async () => {
    setSaving(true);
    setErr("");
    setOk("");
    try {
      const name = form.name.trim();
      if (!name) throw new Error("Name is required.");

      let payload: any;

      if (variant === "personal") {
        payload = {
          name,
          image: form.image.trim() || null,
          phone: form.phone.trim() || null,
          bio: form.bio.trim() || null,
          timezone: form.timezone.trim() || null,
        };
        if (isAdmin) {
          payload.jobTitle = form.jobTitle.trim() || null;
          payload.department = form.department.trim() || null;
          payload.location = form.location.trim() || null;
        }
      } else if (variant === "email") {
        payload = {
          name,
          personalEmail: form.personalEmail.trim() || null,
        };
      } else {
        throw new Error("Invalid profile section.");
      }

      await onSave(payload);
      setOk("Saved successfully.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const showPersonalFields = variant === "personal";
  const showEmailFields = variant === "email";

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle>{showPersonalFields ? "Personal details" : "Contact email"}</CardTitle>
        <CardDescription>
          {showPersonalFields
            ? "Update how your name and contact details appear to teammates."
            : "Your sign-in email is managed separately. Add a personal email for contact and notifications."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {err ? (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}
        {ok ? (
          <Alert>
            <AlertDescription>{ok}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {showPersonalFields ? (
            <>
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={profile?.role || ""} disabled readOnly className="bg-muted/40" />
              </div>
              <div className="space-y-2">
                <Label>Avatar URL</Label>
                <Input
                  value={form.image}
                  onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                  placeholder="Optional — or upload a photo below"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  placeholder="e.g. Asia/Kolkata"
                />
              </div>
              {isAdmin ? (
                <>
                  <div className="space-y-2">
                    <Label>Job title</Label>
                    <Input value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
                  </div>
                </>
              ) : null}
              <div className="space-y-2 md:col-span-2">
                <Label>Bio</Label>
                <Textarea
                  rows={4}
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                />
              </div>
            </>
          ) : null}

          {showEmailFields ? (
            <>
              <div className="space-y-2 md:col-span-2">
                <Label>Sign-in email</Label>
                <Input value={profile?.email || ""} disabled readOnly className="bg-muted/40" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Personal email</Label>
                <Input
                  type="email"
                  autoComplete="email"
                  value={form.personalEmail}
                  onChange={(e) => setForm((f) => ({ ...f, personalEmail: e.target.value }))}
                  placeholder="you@personal.example"
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
          {extraActions}
        </div>
      </CardContent>
    </Card>
  );
}
