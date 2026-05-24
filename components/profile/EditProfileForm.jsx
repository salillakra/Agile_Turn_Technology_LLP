"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Field from "@/components/ui/Field";
import Textarea from "@/components/ui/Textarea";
import Card from "@/components/ui/Card";

/**
 * @param {Object} props
 * @param {'personal' | 'email'} props.variant
 */
export default function EditProfileForm({ profile, isAdmin, onSave, variant = "personal", extraActions }) {
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

      let payload;

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
      setOk("Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const showPersonalFields = variant === "personal";
  const showEmailFields = variant === "email";

  return (
    <Card glass style={{ padding: "22px 26px" }} className="relative overflow-hidden">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-blue-500/5 blur-2xl dark:bg-blue-400/10" aria-hidden />
      <div className="relative">
        {err ? (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-400/30 bg-red-500/[0.08] px-3 py-2 text-sm text-red-600 backdrop-blur-sm dark:text-red-300"
          >
            {err}
          </div>
        ) : null}
        {ok ? (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2 text-sm text-emerald-700 backdrop-blur-sm dark:text-emerald-300">
            {ok}
          </div>
        ) : null}

        <div className="grid min-w-0 grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-4 [&>*]:min-w-0">
          {showPersonalFields ? (
            <>
              <Field label="Full name">
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Role (read-only)">
                <Input value={profile?.role || ""} disabled readOnly />
              </Field>
              <Field label="Avatar URL (optional)">
                <Input
                  value={form.image}
                  onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                  placeholder="https://… or leave empty if you upload a photo"
                />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </Field>
              <Field label="Timezone">
                <Input
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  placeholder="e.g. Asia/Kolkata"
                />
              </Field>
              {isAdmin ? (
                <>
                  <Field label="Job title">
                    <Input value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} />
                  </Field>
                  <Field label="Department / team">
                    <Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
                  </Field>
                  <Field label="Location">
                    <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
                  </Field>
                </>
              ) : null}
              <div className="md:col-span-2">
                <Field label="Bio">
                  <Textarea rows={4} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
                </Field>
              </div>
            </>
          ) : null}

          {showEmailFields ? (
            <>
              <div className="md:col-span-2">
                <p className="m-0 mb-4 text-sm leading-relaxed text-[var(--text-muted)]">
                  Your <strong className="text-[var(--text-heading-soft)]">sign-in email</strong> is used to log in and cannot be
                  changed here. Add a <strong className="text-[var(--text-heading-soft)]">personal email</strong> for contact and
                  notifications if it should differ.
                </p>
              </div>
              <Field label="Sign-in email (read-only)">
                <Input value={profile?.email || ""} disabled readOnly />
              </Field>
              <Field label="Personal email (optional)">
                <Input
                  type="email"
                  autoComplete="email"
                  value={form.personalEmail}
                  onChange={(e) => setForm((f) => ({ ...f, personalEmail: e.target.value }))}
                  placeholder="you@personal.example"
                />
              </Field>
            </>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {extraActions}
        </div>
      </div>
    </Card>
  );
}
