import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchJobs,
  fetchJobAssignments,
  fetchUsers,
  createJob,
  updateJob,
  deleteJob,
  addJobAssignment,
  removeJobAssignment,
  importJobsFromCsv,
  parseJobDescriptionFile,
  type Job,
  type JobImportResult,
  type JobParseResult,
} from "@/lib/api/jobs";

export const jobKeys = {
  all: ["jobs"] as const,
  list: () => ["jobs", "list"] as const,
  assignments: (jobId: string) => ["jobs", "assignments", jobId] as const,
  users: (role: string, q: string) => ["users", role, q] as const,
};

export function useJobs() {
  return useQuery({
    queryKey: jobKeys.list(),
    queryFn: fetchJobs,
    staleTime: 30_000,
  });
}

export function useJobAssignments(jobId: string, enabled = false) {
  return useQuery({
    queryKey: jobKeys.assignments(jobId),
    queryFn: () => fetchJobAssignments(jobId),
    enabled,
    staleTime: 20_000,
  });
}

export function useUsers(role: string, q: string, enabled = false) {
  return useQuery({
    queryKey: jobKeys.users(role, q),
    queryFn: () => fetchUsers(role, q),
    enabled,
    staleTime: 30_000,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createJob(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: jobKeys.list() });
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, payload }: { jobId: string; payload: Record<string, unknown> }) =>
      updateJob(jobId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: jobKeys.list() });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => deleteJob(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: jobKeys.list() });
    },
  });
}

export function useAddAssignment(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => addJobAssignment(jobId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: jobKeys.assignments(jobId) });
    },
  });
}

export function useRemoveAssignment(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeJobAssignment(jobId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: jobKeys.assignments(jobId) });
    },
  });
}

export function useImportJobs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importJobsFromCsv(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: jobKeys.list() });
    },
  });
}

export function useParseJobDescription() {
  return useMutation({
    mutationFn: (file: File) => parseJobDescriptionFile(file),
  });
}

export type { JobImportResult, JobParseResult };
