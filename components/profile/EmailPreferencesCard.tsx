"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmailPreferences, useUpdateEmailPreferences } from "@/hooks/queries/useEmailPreferences";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type EmailPrefDraft = {
  stageUpdates: boolean;
  interviewEmails: boolean;
  interviewReminders: boolean;
  offerEmails: boolean;
  marketingEmails: boolean;
};

const DEFAULT_DRAFT: EmailPrefDraft = {
  stageUpdates: true,
  interviewEmails: true,
  interviewReminders: true,
  offerEmails: true,
  marketingEmails: false,
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex flex-col gap-1.5 pr-2">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 self-center">
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}

export default function EmailPreferencesCard() {
  const { data: prefs, isLoading, error } = useEmailPreferences();
  const updateMutation = useUpdateEmailPreferences();

  const [draft, setDraft] = useState<EmailPrefDraft>(DEFAULT_DRAFT);

  useEffect(() => {
    if (prefs) {
      setDraft({
        stageUpdates: Boolean(prefs.stageUpdates),
        interviewEmails: Boolean(prefs.interviewEmails ?? true),
        interviewReminders: Boolean(prefs.interviewReminders),
        offerEmails: Boolean(prefs.offerEmails ?? true),
        marketingEmails: Boolean(prefs.marketingEmails),
      });
    }
  }, [prefs]);

  const dirty = useMemo(() => {
    if (!prefs) return false;
    return (
      Boolean(draft.stageUpdates) !== Boolean(prefs.stageUpdates) ||
      Boolean(draft.interviewEmails) !== Boolean(prefs.interviewEmails ?? true) ||
      Boolean(draft.interviewReminders) !== Boolean(prefs.interviewReminders) ||
      Boolean(draft.offerEmails) !== Boolean(prefs.offerEmails ?? true) ||
      Boolean(draft.marketingEmails) !== Boolean(prefs.marketingEmails)
    );
  }, [draft, prefs]);

  const save = () => {
    updateMutation.mutate({
      stageUpdates: Boolean(draft.stageUpdates),
      interviewEmails: Boolean(draft.interviewEmails),
      interviewReminders: Boolean(draft.interviewReminders),
      offerEmails: Boolean(draft.offerEmails),
      marketingEmails: Boolean(draft.marketingEmails),
    });
  };

  const busy = isLoading || updateMutation.isPending;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-2 border-b px-6 py-5">
        <CardTitle>Email preferences</CardTitle>
        <CardDescription>
          Choose which emails you want. Password reset and account invites are always sent when
          required.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-6 py-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load preferences"}
            </AlertDescription>
          </Alert>
        ) : null}

        {updateMutation.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {updateMutation.error instanceof Error
                ? updateMutation.error.message
                : "Save failed"}
            </AlertDescription>
          </Alert>
        ) : null}

        {updateMutation.isSuccess ? (
          <Alert>
            <AlertDescription>Email preferences saved.</AlertDescription>
          </Alert>
        ) : null}

        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          <ToggleRow
            label="Stage updates"
            description="When candidates move through pipeline stages (except interview and offer, which have their own toggles)."
            checked={draft.stageUpdates}
            onChange={(v) => setDraft((d) => ({ ...d, stageUpdates: v }))}
            disabled={busy}
          />
          <ToggleRow
            label="Interview emails"
            description="Scheduled, rescheduled, and cancelled interview notices."
            checked={draft.interviewEmails}
            onChange={(v) => setDraft((d) => ({ ...d, interviewEmails: v }))}
            disabled={busy}
          />
          <ToggleRow
            label="Interview reminders"
            description="24h and 1h reminders before interviews."
            checked={draft.interviewReminders}
            onChange={(v) => setDraft((d) => ({ ...d, interviewReminders: v }))}
            disabled={busy}
          />
          <ToggleRow
            label="Offer letters"
            description="Offer letter emails when a candidate reaches Offer Sent."
            checked={draft.offerEmails}
            onChange={(v) => setDraft((d) => ({ ...d, offerEmails: v }))}
            disabled={busy}
          />
          <ToggleRow
            label="Product updates"
            description="Occasional announcements and product news. Off by default."
            checked={draft.marketingEmails}
            onChange={(v) => setDraft((d) => ({ ...d, marketingEmails: v }))}
            disabled={busy}
          />
        </div>
      </CardContent>
      <CardFooter className="gap-3 border-t px-6 py-4">
        <Button onClick={save} disabled={busy || !dirty}>
          {updateMutation.isPending ? "Saving..." : dirty ? "Save preferences" : "Saved"}
        </Button>
        {isLoading ? <span className="text-sm text-muted-foreground">Loading...</span> : null}
      </CardFooter>
    </Card>
  );
}
