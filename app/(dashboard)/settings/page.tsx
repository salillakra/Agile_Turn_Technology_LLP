"use client";

import PageHeader from "@/components/layout/PageHeader";
import EmailPreferencesCard from "@/components/profile/EmailPreferencesCard";

/**
 * Settings hub — email notification toggles for all dashboard roles
 * (ADMIN, RECRUITER, HIRING_MANAGER).
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Control which emails you receive. Changes apply to your signed-in account."
      />
      <EmailPreferencesCard />
    </div>
  );
}
