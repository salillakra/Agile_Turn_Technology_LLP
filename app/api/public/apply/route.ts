import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import { isValidCuid } from "@/src/lib/validate-id";
import {
  buildApplicationCreatedDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import type { CandidateSource } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  ensureResumeUploadDir,
  getResumeUploadDir,
  RESUME_READ_URL_PREFIX,
  tryRemovePreviousResumeFile,
} from "@/src/lib/resume-storage";
import {
  buildStoredFileName,
  getMaxResumeBytes,
  RESUME_FILE_TOO_LARGE_MESSAGE,
  validateResumeFile,
} from "@/src/lib/resume-upload-validation";
import {
  notifyRecruitersApplicationCreated,
  notifyRecruitersCandidateAdded,
  scheduleNotificationWork,
} from "@/src/lib/notification-service";
import { syncCrmSubmissionForApplication } from "@/src/lib/crm/crm-submission-sync";

export const runtime = "nodejs";

const ALLOWED_SOURCES: CandidateSource[] = [
  "LINKEDIN",
  "INDEED",
  "REFERRAL",
  "COMPANY_WEBSITE",
  "GLASSDOOR",
  "HEADHUNTER",
  "OTHER",
];

type ApplyFields = {
  candidateName: string;
  email: string;
  contactNumber: string;
  jobId: string;
  candidateSource: CandidateSource | undefined;
  totalExperience: number | undefined;
  relevantExperience: number | undefined;
  currentCompany: string | null;
  currentDesignation: string | null;
  resumeUrl: string | null;
};

async function parseRequest(request: Request): Promise<
  | { ok: true; fields: ApplyFields; resumeFile: File | null }
  | { ok: false; response: NextResponse }
> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return { ok: false, response: apiError("BAD_REQUEST", "Could not parse multipart body.", 400) };
    }

    const getStr = (key: string) => {
      const v = formData.get(key);
      return typeof v === "string" ? v.trim() : "";
    };

    const fileEntry = formData.get("file");
    const resumeFile =
      fileEntry != null && typeof fileEntry !== "string" && "arrayBuffer" in fileEntry
        ? (fileEntry as File)
        : null;

    const fields: ApplyFields = {
      candidateName: getStr("candidateName"),
      email: getStr("email").toLowerCase(),
      contactNumber: getStr("contactNumber"),
      jobId: getStr("jobId"),
      candidateSource:
        getStr("candidateSource") !== "" &&
        ALLOWED_SOURCES.includes(getStr("candidateSource") as CandidateSource)
          ? (getStr("candidateSource") as CandidateSource)
          : undefined,
      totalExperience:
        getStr("totalExperience") !== "" ? Number(getStr("totalExperience")) : undefined,
      relevantExperience:
        getStr("relevantExperience") !== "" ? Number(getStr("relevantExperience")) : undefined,
      currentCompany: getStr("currentCompany") || null,
      currentDesignation: getStr("currentDesignation") || null,
      resumeUrl: getStr("resumeUrl") || null,
    };

    return { ok: true, fields, resumeFile };
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const candidateName =
    typeof body.candidateName === "string" ? body.candidateName.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const email = emailRaw.toLowerCase();
  const contactNumberRaw =
    body.contactNumber != null ? String(body.contactNumber).trim() : "";
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";

  const sourceRaw = body.candidateSource;
  const candidateSource: CandidateSource | undefined =
    typeof sourceRaw === "string" && ALLOWED_SOURCES.includes(sourceRaw as CandidateSource)
      ? (sourceRaw as CandidateSource)
      : undefined;

  const totalExperience =
    body.totalExperience != null ? Number(body.totalExperience) : undefined;
  const relevantExperience =
    body.relevantExperience != null ? Number(body.relevantExperience) : undefined;
  const currentCompany =
    typeof body.currentCompany === "string" ? body.currentCompany.trim() || null : null;
  const currentDesignation =
    typeof body.currentDesignation === "string"
      ? body.currentDesignation.trim() || null
      : null;
  const resumeUrl =
    typeof body.resumeUrl === "string" ? body.resumeUrl.trim() || null : null;

  const fields: ApplyFields = {
    candidateName,
    email,
    contactNumber: contactNumberRaw,
    jobId,
    candidateSource,
    totalExperience,
    relevantExperience,
    currentCompany,
    currentDesignation,
    resumeUrl,
  };

  return { ok: true, fields, resumeFile: null };
}

/**
 * POST /api/public/apply
 * Public candidate apply endpoint (no recruiter auth).
 * Creates/reuses candidate by email and creates APPLIED application for an OPEN job.
 *
 * **Body:** `application/json` (same as before) **or** `multipart/form-data` with the same field names
 * plus optional `file` (resume PDF/DOC/DOCX). When `file` is present, it is stored locally and
 * `Candidate.resumeUrl` / `resumeFileName` are set before the application is created.
 */
export async function POST(request: Request) {
  const parsed = await parseRequest(request);
  if (parsed.ok === false) return parsed.response;

  let { fields } = parsed;
  const { resumeFile } = parsed;

  let resumeUrlFinal: string | null = fields.resumeUrl;
  let resumeFileName: string | null = null;

  if (resumeFile != null && resumeFile.size > 0) {
    const maxBytes = getMaxResumeBytes();
    if (resumeFile.size > maxBytes) {
      return apiError("FILE_TOO_LARGE", RESUME_FILE_TOO_LARGE_MESSAGE, 400);
    }
    const originalFileName = typeof resumeFile.name === "string" ? resumeFile.name : "upload";
    const mimeType = typeof resumeFile.type === "string" ? resumeFile.type : "";
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    const validated = validateResumeFile({
      originalName: originalFileName,
      mimeType,
      buffer,
    });
    if (validated.ok === false) {
      return apiError(validated.code, validated.message, 400);
    }
    ensureResumeUploadDir();
    const storedName = buildStoredFileName(validated.ext);
    const absolutePath = path.join(getResumeUploadDir(), storedName);
    resumeUrlFinal = `${RESUME_READ_URL_PREFIX}${encodeURIComponent(storedName)}`;
    resumeFileName = originalFileName;
    try {
      await writeFile(absolutePath, buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Write failed";
      return apiError("WRITE_FAILED", "Could not save resume file.", 500, { reason: msg });
    }
  }

  fields = { ...fields, resumeUrl: resumeUrlFinal };

  const candidateName = fields.candidateName;
  const email = fields.email.toLowerCase();
  const contactNumber = fields.contactNumber;
  const jobId = fields.jobId;

  if (!candidateName) {
    return apiError("VALIDATION_ERROR", "candidateName is required", 400);
  }
  if (!email) {
    return apiError("VALIDATION_ERROR", "email is required", 400);
  }
  if (!contactNumber) {
    return apiError("VALIDATION_ERROR", "contactNumber is required", 400);
  }
  if (!jobId) {
    return apiError("VALIDATION_ERROR", "jobId is required", 400);
  }
  if (!isValidCuid(jobId)) {
    return apiError("INVALID_ID", "Malformed ID format", 400);
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return apiError("NOT_FOUND", "Job not found", 404);
  if (job.status !== "OPEN") {
    return apiError("FORBIDDEN", "Applications are only allowed for open jobs", 403);
  }

  const createdDetails = serializeActivityLogDetails(
    buildApplicationCreatedDetails(jobId)
  );
  if (createdDetails.ok === false) {
    return apiError(createdDetails.code, createdDetails.message, 400);
  }

  const existingCandidate = await prisma.candidate.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
    select: { id: true, resumeUrl: true },
  });

  let candidateId: string;
  let isNewCandidate = false;

  if (existingCandidate) {
    candidateId = existingCandidate.id;
    if (resumeUrlFinal) {
      const previousResumeUrl = existingCandidate.resumeUrl;
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          resumeUrl: resumeUrlFinal,
          resumeFileName: resumeFileName ?? undefined,
        },
      });
      await tryRemovePreviousResumeFile(previousResumeUrl);
    }
  } else {
    candidateId = (
      await prisma.candidate.create({
        data: {
          candidateName,
          email,
          contactNumber,
          totalExperience: Number.isInteger(fields.totalExperience)
            ? fields.totalExperience
            : undefined,
          relevantExperience: Number.isInteger(fields.relevantExperience)
            ? fields.relevantExperience
            : undefined,
          currentCompany: fields.currentCompany,
          currentDesignation: fields.currentDesignation,
          resumeUrl: resumeUrlFinal,
          resumeFileName: resumeFileName ?? undefined,
          candidateSource: fields.candidateSource,
        },
        select: { id: true },
      })
    ).id;
    isNewCandidate = true;
  }

  try {
    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.application.create({
        data: {
          candidateId,
          jobId,
          stage: "APPLIED",
          source: "PUBLIC_PORTAL",
        },
        include: { candidate: true, job: true },
      });

      await tx.activityLog.create({
        data: {
          applicationId: created.id,
          userId: null,
          action: "APPLICATION_CREATED",
          details: createdDetails.json,
        },
      });

      return created;
    });

    if (isNewCandidate) {
      scheduleNotificationWork(
        notifyRecruitersCandidateAdded({
          candidateId,
          candidateName,
        })
      );
    }
    scheduleNotificationWork(
      notifyRecruitersApplicationCreated({
        applicationId: application.id,
        candidateName: application.candidate.candidateName,
        jobTitle: application.job.title,
        jobId: application.jobId,
      })
    );

    void syncCrmSubmissionForApplication(application.id, application.jobId).catch((e) => {
      console.error("[POST /api/public/apply] CRM submission sync failed:", e);
    });

    return NextResponse.json(application, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return apiError(
          "CONFLICT",
          "You have already applied to this job with this email",
          409
        );
      }

      return apiError(
        "APPLICATION_CREATE_FAILED",
        e.message || "Unable to submit application.",
        500,
        {
          prismaCode: e.code,
          meta: e.meta,
          jobId,
          email,
        }
      );
    }

    return apiError(
      "APPLICATION_CREATE_FAILED",
      e instanceof Error ? e.message : "Unable to submit application.",
      500,
      { jobId, email }
    );
  }
}
