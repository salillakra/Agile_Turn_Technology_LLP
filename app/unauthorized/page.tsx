"use client";

import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--app-bg)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
          borderRadius: 12,
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: "'Fraunces', serif",
            fontSize: 24,
            fontWeight: 800,
            color: "var(--text-heading)",
          }}
        >
          Access Denied
        </h1>
        <p
          style={{
            margin: "12px 0 24px",
            fontSize: 14,
            color: "var(--text-body)",
            lineHeight: 1.5,
          }}
        >
          You do not have permission to view this page.
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "stretch",
          }}
        >
          <Link
            href="/dashboard"
            style={{
              display: "block",
              padding: "12px 16px",
              borderRadius: 9,
              background: "#3B82F6",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Go to Dashboard
          </Link>
          <Link
            href="/login"
            style={{
              display: "block",
              padding: "12px 16px",
              borderRadius: 9,
              border: "1px solid var(--app-border)",
              background: "var(--chrome-muted-bg)",
              color: "var(--text-body)",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Return to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
