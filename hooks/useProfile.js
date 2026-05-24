"use client";

import { useCallback, useState } from "react";

async function readErrorMessage(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return body?.message || body?.error || fallback;
}

/**
 * Fetches `/api/profile`, updates via `PUT /api/profile/update`, exposes `profileCompleteness`.
 */
export function useProfile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile", { credentials: "same-origin" });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, `Failed to load profile (${res.status})`));
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (payload) => {
    setError("");
    const res = await fetch("/api/profile/update", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || json?.error || `Update failed (${res.status})`);
    }
    setData(json);
    return json;
  }, []);

  const uploadAvatar = useCallback(async (file) => {
    setError("");
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/profile/upload-avatar", {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || json?.error || `Upload failed (${res.status})`);
    }
    setData(json);
    return json;
  }, []);

  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    setError("");
    const res = await fetch("/api/profile/change-password", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
    }
    return json;
  }, []);

  return {
    profile: data,
    loading,
    error,
    setError,
    reload,
    updateProfile,
    uploadAvatar,
    changePassword,
  };
}
