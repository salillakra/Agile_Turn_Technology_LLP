import apiClient from "@/lib/axios";

export interface Application {
  id: string;
  candidateId?: string;
  jobId: string;
  stage: string;
  rating?: number;
  notes?: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  source?: string;
  tags?: string[];
  createdAt?: string;
}

export interface ApplicationsResponse {
  data: Application[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

export async function fetchApplications(params?: {
  stage?: string;
  source?: string;
  jobId?: string;
  limit?: number;
  cursor?: string;
}): Promise<ApplicationsResponse> {
  const q = new URLSearchParams();
  if (params?.stage) q.set("stage", params.stage);
  if (params?.source) q.set("source", params.source);
  if (params?.jobId) q.set("jobId", params.jobId);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.cursor) q.set("cursor", params.cursor);
  const { data } = await apiClient.get<ApplicationsResponse>(`/applications?${q}`);
  return data;
}

export async function createCandidate(payload: {
  candidateName: string;
  email: string;
  contactNumber?: string;
  candidateSource?: string;
}): Promise<{ id: string }> {
  const { data } = await apiClient.post<{ id: string }>("/candidates", payload);
  return data;
}

export async function createApplication(payload: {
  candidateId: string;
  jobId: string;
  stage?: string;
  source?: string;
  rating?: number;
  notes?: string;
}): Promise<Application> {
  const { data } = await apiClient.post<Application>("/applications", payload);
  return data;
}

export async function deleteApplication(
  applicationId: string,
  reason = "Removed from pipeline"
): Promise<void> {
  await apiClient.delete(`/applications/${encodeURIComponent(applicationId)}`, {
    data: { withdrawnReason: reason },
  });
}

export async function uploadResume(candidateId: string, file: File): Promise<void> {
  const fd = new FormData();
  fd.set("file", file);
  await apiClient.post(
    `/candidates/${encodeURIComponent(candidateId)}/resume`,
    fd,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
}

export async function parseResume(candidateId: string): Promise<void> {
  await apiClient.post(`/candidates/${encodeURIComponent(candidateId)}/resume/parse`);
}

export async function getParseStatus(candidateId: string): Promise<{
  status: string;
  resumeParseJobId?: string;
  result?: unknown;
  error?: string;
}> {
  const { data } = await apiClient.get(
    `/candidates/${encodeURIComponent(candidateId)}/parse-status`
  );
  return data;
}

export async function applyParsedProfile(
  candidateId: string,
  payload: { resumeParseJobId?: string; result?: unknown }
): Promise<void> {
  await apiClient.post(
    `/candidates/${encodeURIComponent(candidateId)}/resume/parse/apply`,
    payload
  );
}

export async function getResumeMatch(
  jobId: string,
  candidateId: string
): Promise<{ eligible: boolean; matchPercent: number }> {
  const { data } = await apiClient.get(
    `/jobs/${encodeURIComponent(jobId)}/resume-match?candidateId=${encodeURIComponent(candidateId)}`
  );
  return data;
}

// CRM
export async function fetchCrmSummary(): Promise<unknown> {
  const { data } = await apiClient.get("/crm/revenue/summary");
  return data;
}

export async function fetchCrmLeads(limit = 50): Promise<unknown[]> {
  const { data } = await apiClient.get<{ data: unknown[] }>(`/crm/leads?limit=${limit}`);
  return Array.isArray(data?.data) ? data.data : [];
}

export async function fetchCrmClients(limit = 50): Promise<unknown[]> {
  const { data } = await apiClient.get<{ data: unknown[] }>(`/crm/clients?limit=${limit}`);
  return Array.isArray(data?.data) ? data.data : [];
}

export async function fetchCrmRequirements(limit = 50): Promise<unknown[]> {
  const { data } = await apiClient.get<{ data: unknown[] }>(`/crm/requirements?limit=${limit}`);
  return Array.isArray(data?.data) ? data.data : [];
}

export async function fetchCrmInvoices(limit = 50): Promise<unknown[]> {
  const { data } = await apiClient.get<{ data: unknown[] }>(`/crm/invoices?limit=${limit}`);
  return Array.isArray(data?.data) ? data.data : [];
}

export async function createLead(payload: {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
}): Promise<unknown> {
  const { data } = await apiClient.post("/crm/leads", payload);
  return data;
}

export async function convertLead(leadId: string): Promise<unknown> {
  const { data } = await apiClient.post(`/crm/leads/${encodeURIComponent(leadId)}/convert`, {});
  return data;
}

export async function createClient(payload: {
  name: string;
  industry: string;
  billingEmail: string;
}): Promise<unknown> {
  const { data } = await apiClient.post("/crm/clients", payload);
  return data;
}

export async function createRequirement(payload: Record<string, unknown>): Promise<unknown> {
  const { data } = await apiClient.post("/crm/requirements", payload);
  return data;
}

export async function activateRequirement(requirementId: string): Promise<unknown> {
  const { data } = await apiClient.post(
    `/crm/requirements/${encodeURIComponent(requirementId)}/activate`
  );
  return data;
}

export async function markInvoicePaid(invoiceId: string): Promise<unknown> {
  const { data } = await apiClient.patch(`/crm/invoices/${encodeURIComponent(invoiceId)}`, {
    status: "PAID",
  });
  return data;
}
