"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmailPreferences, useUpdateEmailPreferences } from "@/hooks/queries/useEmailPreferences";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

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
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-1">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}

export default function EmailPreferencesCard() {
  const { data: prefs, isLoading, error } = useEmailPreferences();
  const updateMutation = useUpdateEmailPreferences();

  const [draft, setDraft] = useState({
    stageUpdates: true,
    interviewReminders: true,
    marketingEmails: false,
  });

  useEffect(() => {
    if (prefs) {
      setDraft({
        stageUpdates: Boolean(prefs.stageUpdates),
        interviewReminders: Boolean(prefs.interviewReminders),
        marketingEmails: Boolean(prefs.marketingEmails),
      });
    }
  }, [prefs]);

  const dirty = useMemo(() => {
    if (!prefs) return false;
    return (
      Boolean(draft.stageUpdates) !== Boolean(prefs.stageUpdates) ||
      Boolean(draft.interviewReminders) !== Boolean(prefs.interviewReminders) ||
      Boolean(draft.marketingEmails) !== Boolean(prefs.marketingEmails)
    );
  }, [draft, prefs]);

  const save = () => {
    updateMutation.mutate({
      stageUpdates: Boolean(draft.stageUpdates),
      interviewReminders: Boolean(draft.interviewReminders),
      marketingEmails: Boolean(draft.marketingEmails),
    });
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Email preferences</CardTitle>
        <CardDescription>
          Choose optional notifications. Security and account emails may still be sent when required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
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
              {updateMutation.error instanceof Error ? updateMutation.error.message : "Save failed"}
            </AlertDescription>
          </Alert>
        ) : null}

        {updateMutation.isSuccess ? (
          <Alert>
            <AlertDescription>Email preferences saved.</AlertDescription>
          </Alert>
        ) : null}

        <div className="divide-y divide-border rounded-lg border border-border px-4">
          <ToggleRow
            label="Stage updates"
            description="Updates when candidates move through pipeline stages."
            checked={draft.stageUpdates}
            onChange={(v) => setDraft((d) => ({ ...d, stageUpdates: v }))}
            disabled={isLoading || updateMutation.isPending}
          />
          <ToggleRow
            label="Interview reminders"
            description="Reminders for upcoming interviews."
            checked={draft.interviewReminders}
            onChange={(v) => setDraft((d) => ({ ...d, interviewReminders: v }))}
            disabled={isLoading || updateMutation.isPending}
          />
          <ToggleRow
            label="Product updates"
            description="Occasional announcements and product news. Off by default."
            checked={draft.marketingEmails}
            onChange={(v) => setDraft((d) => ({ ...d, marketingEmails: v }))}
            disabled={isLoading || updateMutation.isPending}
          />
        </div>

        <Separator />

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={isLoading || updateMutation.isPending || !dirty}>
            {updateMutation.isPending ? "Saving..." : dirty ? "Save preferences" : "Saved"}
          </Button>
          {isLoading ? <span className="text-sm text-muted-foreground">Loading...</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
