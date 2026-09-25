/**
 * Browser resume upload: presigned PUT to S3-compatible storage, then metadata POST.
 * Falls back to multipart through the ATS when STORAGE_PROVIDER=local.
 */
export async function uploadCandidateResume(
  candidateId: string,
  file: File
): Promise<Record<string, unknown>> {
  const presignRes = await fetch("/api/resumes/presign", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidateId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  const presign = (await presignRes.json().catch(() => ({}))) as {
    mode?: string;
    objectKey?: string;
    uploadUrl?: string;
    headers?: Record<string, string>;
    message?: string;
    error?: string;
  };
  if (!presignRes.ok) {
    throw new Error(
      presign.message || presign.error || `Presign failed (${presignRes.status})`
    );
  }

  if (presign.mode === "direct" && presign.uploadUrl && presign.objectKey) {
    const putHeaders: Record<string, string> = {};
    if (presign.headers?.["Content-Type"]) {
      putHeaders["Content-Type"] = presign.headers["Content-Type"];
    }
    const putRes = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: putHeaders,
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(`Object storage rejected the upload (${putRes.status})`);
    }
    const completeRes = await fetch(
      `/api/candidates/${encodeURIComponent(candidateId)}/resume`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey: presign.objectKey,
          originalFileName: file.name,
          contentType: putHeaders["Content-Type"] || file.type,
          size: file.size,
        }),
      }
    );
    const completeBody = (await completeRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    > & { message?: string; error?: string };
    if (!completeRes.ok) {
      throw new Error(
        completeBody.message ||
          completeBody.error ||
          `Resume complete failed (${completeRes.status})`
      );
    }
    return completeBody;
  }

  const fd = new FormData();
  fd.set("file", file);
  const uploadRes = await fetch(
    `/api/candidates/${encodeURIComponent(candidateId)}/resume`,
    {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    }
  );
  const uploadBody = (await uploadRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  > & { message?: string; error?: string };
  if (!uploadRes.ok) {
    throw new Error(
      uploadBody.message ||
        uploadBody.error ||
        `Resume upload failed (${uploadRes.status})`
    );
  }
  return uploadBody;
}
