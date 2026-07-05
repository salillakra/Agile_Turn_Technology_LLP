import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchApplications,
  createCandidate,
  createApplication,
  deleteApplication,
  fetchCrmSummary,
  fetchCrmLeads,
  fetchCrmClients,
  fetchCrmRequirements,
  fetchCrmInvoices,
  createLead,
  convertLead,
  createClient,
  createRequirement,
  activateRequirement,
  markInvoicePaid,
} from "@/lib/api/applicants";

export const applicantKeys = {
  all: ["applicants"] as const,
  list: (params?: Record<string, string>) => ["applicants", "list", params] as const,
};

export const crmKeys = {
  all: ["crm"] as const,
  summary: () => ["crm", "summary"] as const,
  leads: () => ["crm", "leads"] as const,
  clients: () => ["crm", "clients"] as const,
  requirements: () => ["crm", "requirements"] as const,
  invoices: () => ["crm", "invoices"] as const,
};

export function useApplications(params?: {
  stage?: string;
  source?: string;
  jobId?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: applicantKeys.list(params as Record<string, string>),
    queryFn: () => fetchApplications({ ...params, limit: params?.limit ?? 100 }),
    staleTime: 20_000,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      name: string;
      email: string;
      phone?: string;
      jobId: string;
      source?: string;
      stage?: string;
      rating?: number;
      notes?: string;
      candidateSource?: string;
      existingCandidateId?: string;
    }) => {
      let candidateId = vars.existingCandidateId;
      if (!candidateId) {
        const c = await createCandidate({
          candidateName: vars.name.trim(),
          email: vars.email.trim(),
          contactNumber: vars.phone?.trim() || "",
          candidateSource: vars.candidateSource ?? "OTHER",
        });
        candidateId = c.id;
      }
      const app = await createApplication({
        candidateId,
        jobId: vars.jobId,
        stage: vars.stage,
        source: vars.candidateSource ?? undefined,
        rating: vars.rating,
        notes: vars.notes?.trim() || undefined,
      });
      return { candidateId, application: app };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: applicantKeys.all });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) => deleteApplication(applicationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: applicantKeys.all });
    },
  });
}

// CRM Hooks
export function useCrmSummary() {
  return useQuery({
    queryKey: crmKeys.summary(),
    queryFn: fetchCrmSummary,
    staleTime: 30_000,
  });
}

export function useCrmLeads() {
  return useQuery({
    queryKey: crmKeys.leads(),
    queryFn: () => fetchCrmLeads(50),
    staleTime: 30_000,
  });
}

export function useCrmClients() {
  return useQuery({
    queryKey: crmKeys.clients(),
    queryFn: () => fetchCrmClients(50),
    staleTime: 30_000,
  });
}

export function useCrmRequirements() {
  return useQuery({
    queryKey: crmKeys.requirements(),
    queryFn: () => fetchCrmRequirements(50),
    staleTime: 30_000,
  });
}

export function useCrmInvoices() {
  return useQuery({
    queryKey: crmKeys.invoices(),
    queryFn: () => fetchCrmInvoices(50),
    staleTime: 30_000,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all });
    },
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: convertLead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all });
    },
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all });
    },
  });
}

export function useCreateRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRequirement,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all });
    },
  });
}

export function useActivateRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: activateRequirement,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all });
    },
  });
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markInvoicePaid,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.invoices() });
    },
  });
}
