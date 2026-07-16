import apiClient from "@/lib/axios";

export async function fetchDemoLoginConfig(): Promise<{ demoLoginEnabled: boolean }> {
  const { data } = await apiClient.get<{ demoLoginEnabled: boolean }>(
    "/auth/demo-login-config"
  );
  return data;
}

export async function submitDemoLogin(role: string): Promise<void> {
  await apiClient.post("/auth/demo-login", { role });
}

export async function submitForgotPassword(
  email: string
): Promise<{ devResetUrl?: string }> {
  const { data } = await apiClient.post<{ devResetUrl?: string }>(
    "/auth/forgot-password",
    { email }
  );
  return data;
}

export async function submitResetPassword(
  token: string,
  password: string
): Promise<void> {
  await apiClient.post("/auth/reset-password", { token, password });
}
