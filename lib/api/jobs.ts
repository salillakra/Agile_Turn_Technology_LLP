import apiClient from "@/lib/axios";

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  status: "OPEN" | "PAUSED" | "CLOSED";
  applicantCount?: number;
  salary?: string;
  employmentType?: string;
  jobMeta?: {
    employmentType?: string;
    numberOfOpenings?: number;
    roleSummary?: string;
    keyResponsibilities?: string;
    requiredSkills?: string[];
    preferredSkills?: string[];
    resumeMatchThreshold?: number | null;
    experienceRequired?: string;
    pipelineStages?: string[];
    salaryMin?: number | null;
    salaryMax?: number | null;
    currency?: string;
    budgetApprovalStatus?: string;
    education?: string;
    minimumExperienceYears?: number | null;
    locationConstraints?: string;
    applicationDeadline?: string;
    allowReferrals?: boolean;
    tags?: string[];
  };
}

export interface JobAssignment {
  id: string;
  userId: string;
  user?: { name: string; email: string; role: string };
}

export interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function fetchJobs(): Promise<Job[]> {
  const { data } = await apiClient.get<{ data: Job[] }>("/jobs?limit=100");
  return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
}

export async function fetchJobAssignments(jobId: string): Promise<JobAssignment[]> {
  const { data } = await apiClient.get<{ data: JobAssignment[] }>(`/jobs/${jobId}/assignments`);
  return Array.isArray(data?.data) ? data.data : [];
}

export async function fetchUsers(role: string, q = ""): Promise<UserOption[]> {
  const params = new URLSearchParams({ role });
  if (q) params.set("q", q);
  const { data } = await apiClient.get<{ data: UserOption[] }>(`/users?${params}`);
  return Array.isArray(data?.data) ? data.data : [];
}

export async function createJob(payload: Record<string, unknown>): Promise<Job> {
  const { data } = await apiClient.post<Job>("/jobs", payload);
  return data;
}

export async function updateJob(jobId: string, payload: Record<string, unknown>): Promise<Job> {
  const { data } = await apiClient.put<Job>(`/jobs/${jobId}`, payload);
  return data;
}

export async function deleteJob(jobId: string): Promise<void> {
  await apiClient.delete(`/jobs/${jobId}`);
}

export async function addJobAssignment(
  jobId: string,
  userId: string
): Promise<JobAssignment> {
  const { data } = await apiClient.post<JobAssignment>(`/jobs/${jobId}/assignments`, { userId });
  return data;
}

export async function removeJobAssignment(
  jobId: string,
  userId: string
): Promise<void> {
  await apiClient.delete(`/jobs/${jobId}/assignments/${userId}`);
}

export interface JobImportRowResult {
  row: number;
  title: string;
  success: boolean;
  jobId?: string;
  error?: string;
}

export interface JobImportResult {
  created: number;
  failed: number;
  total: number;
  results: JobImportRowResult[];
}

export async function importJobsFromCsv(file: File): Promise<JobImportResult> {
  const fd = new FormData();
  fd.set("file", file);
  const { data } = await apiClient.post<JobImportResult>("/jobs/import", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
