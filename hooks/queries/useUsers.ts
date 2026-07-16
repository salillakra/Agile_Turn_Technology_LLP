import { useQuery } from "@tanstack/react-query";
import axios from "@/lib/axios";

interface UsersParams {
  q?: string;
  role?: string;
}

export function useUsers(params: UsersParams) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      if (params.role) qs.set("role", params.role);
      
      const res = await axios.get(`/users/visible?${qs.toString()}`);
      return res.data;
    },
  });
}

export function useUserProfile(userId: string) {
  return useQuery({
    queryKey: ["userProfile", userId],
    queryFn: async () => {
      const res = await axios.get(`/users/${encodeURIComponent(userId)}/profile`);
      return res.data;
    },
    enabled: !!userId,
  });
}
