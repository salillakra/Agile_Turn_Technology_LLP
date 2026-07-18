import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { sanitizeApplicationIdParam } from "@/src/lib/application-deep-link";
import { formatApplicationStageLabel } from "@/src/lib/application-stage-labels";
import { getEmailBrand } from "@/src/lib/email/templates/brand";

const PIPELINE = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER_SENT",
  "HIRED",
] as const;

function stageIndex(stage: string): number {
  if (stage === "REJECTED") return -1;
  if (stage === "TECHNICAL" || stage === "FINAL_ROUND") return PIPELINE.indexOf("INTERVIEW");
  const i = PIPELINE.indexOf(stage as (typeof PIPELINE)[number]);
  return i;
}

export default async function ApplicationStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const brand = getEmailBrand();
  const { id: raw } = await params;
  const id = sanitizeApplicationIdParam(raw);

  if (!id) {
    return (
      <StatusShell brandName={brand.name}>
        <h1 className="text-xl font-semibold tracking-tight">Invalid link</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This application status link is incomplete or malformed.
        </p>
      </StatusShell>
    );
  }

  const application = await prisma.application.findUnique({
    where: { id },
    select: {
      id: true,
      stage: true,
      appliedDate: true,
      withdrawnAt: true,
      job: { select: { title: true, department: true, location: true } },
      candidate: { select: { candidateName: true } },
    },
  });

  if (!application) {
    return (
      <StatusShell brandName={brand.name}>
        <h1 className="text-xl font-semibold tracking-tight">Application not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We could not find an application for this link. Check the URL or contact your recruiter.
        </p>
      </StatusShell>
    );
  }

  const stageLabel = formatApplicationStageLabel(application.stage);
  const currentIdx = stageIndex(application.stage);
  const withdrawn = application.withdrawnAt != null;
  const rejected = application.stage === "REJECTED";
  const candidateName = application.candidate.candidateName?.trim() || "Applicant";
  const applied = application.appliedDate.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <StatusShell brandName={brand.name}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
        Application status
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{application.job.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {application.job.department}
        {application.job.location ? ` · ${application.job.location}` : ""}
      </p>

      <dl className="mt-6 grid gap-3 text-sm">
        <div className="flex justify-between gap-4 border-b border-border pb-2">
          <dt className="text-muted-foreground">Applicant</dt>
          <dd className="font-medium">{candidateName}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border pb-2">
          <dt className="text-muted-foreground">Applied</dt>
          <dd className="font-medium">{applied}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border pb-2">
          <dt className="text-muted-foreground">Current status</dt>
          <dd className="font-semibold text-primary">
            {withdrawn ? "Withdrawn" : stageLabel}
          </dd>
        </div>
        <div className="flex justify-between gap-4 pb-1">
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="font-mono text-xs text-muted-foreground">{application.id}</dd>
        </div>
      </dl>

      {!withdrawn && !rejected ? (
        <ol className="mt-8 space-y-2">
          {PIPELINE.map((step, i) => {
            const done = currentIdx >= i;
            const active = currentIdx === i;
            return (
              <li
                key={step}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                  active
                    ? "bg-primary/10 font-semibold text-foreground"
                    : done
                      ? "text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                {formatApplicationStageLabel(step)}
              </li>
            );
          })}
        </ol>
      ) : null}

      {rejected ? (
        <p className="mt-6 text-sm text-muted-foreground">
          This application is no longer in progress. Thank you for your interest.
        </p>
      ) : null}

      {withdrawn ? (
        <p className="mt-6 text-sm text-muted-foreground">
          This application was withdrawn.
        </p>
      ) : null}

      <p className="mt-8 text-xs text-muted-foreground">
        Questions? Reply to your recruiting contact. Bookmark this page to check for updates.
      </p>
    </StatusShell>
  );
}

function StatusShell({
  brandName,
  children,
}: {
  brandName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex h-9 items-center">
          <img
            src="/agile_turn_logo.png"
            alt={brandName}
            className="h-full w-auto object-contain dark:invert"
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            {brandName}
          </Link>
        </p>
      </div>
    </div>
  );
}
