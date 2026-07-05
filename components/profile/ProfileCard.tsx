"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

type ProfileCardProps = {
  profile: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
    image?: string | null;
    profileCompleteness?: number;
    profile?: {
      personalEmail?: string | null;
      phone?: string | null;
      jobTitle?: string | null;
      department?: string | null;
      location?: string | null;
      timezone?: string | null;
      bio?: string | null;
    } | null;
  } | null;
  showStrength?: boolean;
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-32 shrink-0 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-all text-sm text-foreground">{value}</dd>
    </div>
  );
}

export default function ProfileCard({ profile, showStrength = true }: ProfileCardProps) {
  if (!profile) return null;

  const pct = typeof profile.profileCompleteness === "number" ? profile.profileCompleteness : 0;
  const p = profile.profile || {};
  const img = profile.image?.trim();
  const subtitle = [profile.role, p.jobTitle].filter(Boolean).join(" · ");

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="border-b pb-6">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-2xl font-semibold text-muted-foreground">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" className="size-full object-cover" />
            ) : (
              (profile.name || "?").slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-xl font-semibold tracking-[-0.02em]">
              {profile.name || "—"}
            </CardTitle>
            <p className="mt-1 break-all text-sm text-muted-foreground">{profile.email}</p>
            {subtitle ? (
              <Badge variant="secondary" className="mt-3 rounded-full">
                {subtitle}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {showStrength ? (
          <div className="space-y-2">
            <Progress value={pct}>
              <ProgressLabel className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Profile strength
              </ProgressLabel>
              <ProgressValue>{pct}%</ProgressValue>
            </Progress>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Complete missing sections to improve visibility across the workspace.
            </p>
          </div>
        ) : null}

        {showStrength ? <Separator /> : null}

        <dl className="space-y-4">
          <DetailRow label="Personal email" value={p.personalEmail} />
          <DetailRow label="Phone" value={p.phone} />
          <DetailRow label="Department" value={p.department} />
          <DetailRow label="Location" value={p.location} />
          <DetailRow label="Timezone" value={p.timezone} />
        </dl>

        {p.bio?.trim() ? (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Bio
              </p>
              <p className="text-sm leading-relaxed text-foreground">{p.bio}</p>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
