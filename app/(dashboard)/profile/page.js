"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Field from "@/components/ui/Field";
import ProfileCard from "@/components/profile/ProfileCard";
import EditProfileForm from "@/components/profile/EditProfileForm";
import EmailPreferencesCard from "@/components/profile/EmailPreferencesCard";
import { useProfile } from "@/hooks/useProfile";
import { T } from "@/lib/helpers";

const PROFILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal" },
  { id: "email", label: "Email" },
  { id: "account", label: "Account" },
];

const panelTransition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };

function TabButton({ active, children, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`relative w-full min-w-0 overflow-x-hidden rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
        active ? "text-blue-700 dark:text-blue-200" : "text-[var(--text-muted)]"
      }`}
      whileHover={{ x: active ? 0 : 3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
    >
      {active ? (
        <motion.div
          layoutId="profileTabHighlight"
          className="absolute inset-0 z-0 rounded-xl glass-panel border border-[var(--glass-border)] shadow-[0_4px_20px_rgba(59,130,246,0.12)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      ) : null}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}

export default function ProfilePage() {
  const { profile, loading, error, reload, updateProfile, uploadAvatar, changePassword } = useProfile();
  const [tab, setTab] = useState("overview");
  const [pw, setPw] = useState({ current: "", next: "", next2: "" });
  const [pwMsg, setPwMsg] = useState({ err: "", ok: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const avatarInputRef = useRef(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState("");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    void reload();
  }, [reload]);

  const isAdmin = profile?.role === "ADMIN";
  const tabs = PROFILE_TABS;

  useEffect(() => {
    if (!profile) return;
    const ids = tabs.map((t) => t.id);
    if (!ids.includes(tab)) setTab(ids[0]);
  }, [profile, tabs, tab]);

  const onAvatarPick = useCallback(
    (e) => {
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
    setAvatarBusy(true);
    setAvatarErr("");
    try {
      await uploadAvatar(file);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
      setAvatarFile(null);
      if (input) input.value = "";
    } catch (err) {
      setAvatarErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAvatarBusy(false);
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
    setPwBusy(true);
    try {
      await changePassword({ currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: "", next: "", next2: "" });
      setPwMsg({ err: "", ok: "Password updated." });
    } catch (err) {
      setPwMsg({ err: err instanceof Error ? err.message : "Failed", ok: "" });
    } finally {
      setPwBusy(false);
    }
  };

  if (loading && !profile) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex w-full min-w-0 items-center gap-3"
      >
        <motion.div
          className="h-4 w-4 rounded-full bg-blue-500/50"
          animate={reduceMotion ? {} : { scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
          transition={reduceMotion ? {} : { duration: 1.1, repeat: Infinity }}
        />
        <p style={{ ...T.mono, color: "var(--text-muted)" }} className="m-0 text-sm">
          Loading profile…
        </p>
      </motion.div>
    );
  }

  const panelMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: panelTransition,
      };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="relative w-full min-w-0 max-w-full"
    >
      <motion.div
        className="mb-8 w-full min-w-0 max-w-2xl"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...panelTransition, delay: 0.04 }}
      >
        <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-500" style={T.mono}>
          Account
        </p>
        <h1 className="m-0 block bg-gradient-to-br from-[var(--text-heading)] to-blue-600 bg-clip-text pb-1 font-['Fraunces',serif] text-2xl font-extrabold leading-tight text-transparent [overflow-wrap:anywhere] dark:to-blue-400">
          Your profile
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)] [overflow-wrap:anywhere]">
          Manage your profile, personal contact email, and security settings. Your sign-in email and role are managed by your
          administrator or registration flow.
        </p>
      </motion.div>

      {error ? (
        <motion.div
          role="alert"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-4 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-600 backdrop-blur-md dark:text-red-300"
        >
          {error}
        </motion.div>
      ) : null}

      <div className="flex w-full min-w-0 flex-col gap-8 xl:flex-row xl:items-start xl:gap-10">
        <motion.aside
          className="w-full shrink-0 xl:w-56"
          initial={reduceMotion ? false : { opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...panelTransition, delay: 0.08 }}
        >
          <nav className="glass-panel-subtle flex flex-row gap-1 overflow-x-auto rounded-2xl p-2 lg:flex-col lg:overflow-visible">
            {tabs.map((t) => (
              <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </TabButton>
            ))}
          </nav>
        </motion.aside>

        <div className="min-w-0 w-full flex-1 space-y-6">
          <AnimatePresence mode="wait">
            {tab === "overview" ? (
              <motion.div key="overview" className="w-full min-w-0" {...panelMotion}>
                <ProfileCard profile={profile} />
              </motion.div>
            ) : null}

            {tab === "personal" ? (
              <motion.div key="personal" className="w-full min-w-0 space-y-6" {...panelMotion}>
                <Card glass className="relative overflow-hidden" style={{ padding: "22px 26px" }}>
                  <div className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl" aria-hidden />
                  <div className="relative">
                    <h2 className="mt-0 mb-3 font-['Fraunces',serif] text-lg font-bold text-[var(--text-heading)]">
                      Profile photo
                    </h2>
                    <p className="mt-0 text-sm text-[var(--text-muted)]">
                      JPEG, PNG, or WebP — max 2MB. Preview before uploading.
                    </p>
                    <div className="mt-4 flex min-w-0 flex-wrap items-start gap-6">
                      <motion.div
                        className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-white/45 bg-[var(--chrome-muted-bg)] shadow-lg dark:border-white/10"
                        whileHover={reduceMotion ? {} : { scale: 1.03 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      >
                        <div className="absolute -inset-px rounded-full bg-gradient-to-br from-blue-500/20 to-transparent opacity-80 dark:from-blue-400/25" />
                        {avatarPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarPreview} alt="" className="relative z-[1] h-full w-full object-cover" />
                        ) : profile?.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={profile.image} alt="" className="relative z-[1] h-full w-full object-cover" />
                        ) : (
                          <div className="relative z-[1] flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                            No photo
                          </div>
                        )}
                      </motion.div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="min-w-0 max-w-full text-sm text-[var(--text-body)] file:mr-3 file:rounded-lg file:border-0 file:bg-blue-500/15 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 dark:file:bg-blue-500/20 dark:file:text-blue-300"
                          disabled={avatarBusy}
                          onChange={onAvatarPick}
                        />
                        {avatarErr ? <p className="m-0 text-sm text-red-400">{avatarErr}</p> : null}
                        <Button variant="ghost" sm disabled={avatarBusy} onClick={() => void submitAvatar()}>
                          {avatarBusy ? "Uploading…" : "Upload photo"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
                <EditProfileForm profile={profile} isAdmin={isAdmin} variant="personal" onSave={updateProfile} />
              </motion.div>
            ) : null}

            {tab === "email" ? (
              <motion.div key="email" {...panelMotion}>
                <div className="grid gap-6">
                  <EditProfileForm profile={profile} isAdmin={isAdmin} variant="email" onSave={updateProfile} />
                  <EmailPreferencesCard />
                </div>
              </motion.div>
            ) : null}

            {tab === "account" ? (
              <motion.div key="account" {...panelMotion}>
                <Card glass className="relative overflow-hidden" style={{ padding: "22px 26px" }}>
                  <div className="relative">
                    <h2 className="mt-0 mb-3 font-['Fraunces',serif] text-lg font-bold text-[var(--text-heading)]">
                      Change password
                    </h2>
                    {pwMsg.err ? (
                      <div className="mb-3 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-600 backdrop-blur-sm dark:text-red-300">
                        {pwMsg.err}
                      </div>
                    ) : null}
                    {pwMsg.ok ? (
                      <div className="mb-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 backdrop-blur-sm dark:text-emerald-300">
                        {pwMsg.ok}
                      </div>
                    ) : null}
                    <div className="max-w-md space-y-3">
                      <Field label="Current password">
                        <Input
                          type="password"
                          autoComplete="current-password"
                          value={pw.current}
                          onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                        />
                      </Field>
                      <Field label="New password">
                        <Input
                          type="password"
                          autoComplete="new-password"
                          value={pw.next}
                          onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                        />
                      </Field>
                      <Field label="Confirm new password">
                        <Input
                          type="password"
                          autoComplete="new-password"
                          value={pw.next2}
                          onChange={(e) => setPw((p) => ({ ...p, next2: e.target.value }))}
                        />
                      </Field>
                      <Button onClick={() => void submitPassword()} disabled={pwBusy}>
                        {pwBusy ? "Updating…" : "Update password"}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
