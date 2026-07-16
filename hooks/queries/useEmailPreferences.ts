import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "@/lib/axios";

export function useEmailPreferences() {
  return useQuery({
    queryKey: ["email-preferences"],
    queryFn: async () => {
      const res = await axios.get("/me/email-preferences");
      return res.data;
    },
  });
}

export function useUpdateEmailPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await axios.patch("/me/email-preferences", payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["email-preferences"], data);
    },
  });
}
