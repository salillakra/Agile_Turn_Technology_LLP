import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "@/lib/axios";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await axios.get("/profile");
      return res.data;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await axios.put("/profile/update", payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["profile"], data);
    },
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await axios.post("/profile/upload-avatar", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["profile"], data);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await axios.post("/profile/change-password", payload);
      return res.data;
    },
  });
}
