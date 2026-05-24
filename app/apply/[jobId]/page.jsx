import { requireAuth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import ApplyFlow from "@/components/apply/ApplyFlow";

export default async function ApplyPage({ params }) {
  const session = await requireAuth();
  const p = await Promise.resolve(params);
  const jobId = typeof p?.jobId === "string" ? p.jobId : "";
  if (!jobId) {
    return <div style={{ padding: 24 }}>Missing job id.</div>;
  }

  const role = session.user?.role;
  const userId = session.user?.id;
  if (!(await canAccessJobByScope(role, userId, jobId))) {
    return <div style={{ padding: 24 }}>You do not have access to this job.</div>;
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, title: true, department: true, location: true, jobMeta: true, status: true },
  });
  if (!job) {
    return <div style={{ padding: 24 }}>Job not found.</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] px-6 py-8 text-[var(--text-body)]">
      <ApplyFlow job={job} />
    </div>
  );
}
