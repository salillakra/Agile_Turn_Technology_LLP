"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useUsers } from "@/hooks/queries/useUsers";
import apiClient from "@/lib/axios";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  SpinnerGap,
  UserPlus,
  EnvelopeSimple,
  Clock,
  CheckCircle,
  XCircle,
  Copy,
} from "@phosphor-icons/react";

function roleLabel(role: string) {
  if (role === "HIRING_MANAGER") return "Hiring Manager";
  if (role === "RECRUITER") return "Recruiter";
  if (role === "ADMIN") return "Admin";
  return role || "—";
}

type Invite = {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  status: "pending" | "used" | "expired";
  inviter?: { name: string; email: string };
};

function InviteStatusBadge({ status }: { status: string }) {
  if (status === "used") {
    return (
      <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950">
        <CheckCircle className="size-3" />
        Accepted
      </Badge>
    );
  }
  if (status === "expired") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground border-border">
        <XCircle className="size-3" />
        Expired
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-blue-700 border-blue-300 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950">
      <Clock className="size-3" />
      Pending
    </Badge>
  );
}

function InviteUserDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("RECRUITER");

  const mutation = useMutation({
    mutationFn: (payload: { email: string; role: string }) =>
      apiClient.post("/invites", payload),
    onSuccess: (res) => {
      toast.success(`Invite sent to ${email}`);
      setEmail("");
      setRole("RECRUITER");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      // Copy invite link to clipboard
      const inviteUrl = res.data?.inviteUrl;
      if (inviteUrl) {
        navigator.clipboard?.writeText(inviteUrl).then(() => {
          toast.info("Invite link copied to clipboard");
        }).catch(() => {});
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send invite.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    mutation.mutate({ email: email.trim(), role });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus className="size-4" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a Team Member</DialogTitle>
          <DialogDescription>
            Send an invite email with a one-time registration link. The invite
            expires in 7 days.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="invite-email">Email address</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="colleague@company.com"
                disabled={mutation.isPending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">Role</FieldLabel>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECRUITER">Recruiter</SelectItem>
                  <SelectItem value="HIRING_MANAGER">Hiring Manager</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={mutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending ? (
                <SpinnerGap className="size-4 animate-spin" />
              ) : (
                <EnvelopeSimple className="size-4" />
              )}
              {mutation.isPending ? "Sending…" : "Send Invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingInvites() {
  const { data, isLoading } = useQuery({
    queryKey: ["invites"],
    queryFn: async () => {
      const res = await apiClient.get("/invites");
      return res.data;
    },
  });

  const invites: Invite[] = Array.isArray(data?.data) ? data.data : [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SpinnerGap className="size-4 animate-spin" />
            Loading invites…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (invites.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            No invites sent yet. Use the button above to invite team members.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-4 px-5 py-3.5"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted">
                <EnvelopeSimple className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {inv.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {roleLabel(inv.role)}
                  {inv.inviter?.name ? ` · Invited by ${inv.inviter.name}` : ""}
                  {" · "}
                  {new Date(inv.createdAt).toLocaleDateString()}
                </p>
              </div>
              <InviteStatusBadge status={inv.status} />
              {inv.status === "pending" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => {
                    const url = `${window.location.origin}/invite/${inv.token}`;
                    navigator.clipboard?.writeText(url).then(() => {
                      toast.success("Invite link copied!");
                    }).catch(() => {
                      toast.error("Failed to copy link.");
                    });
                  }}
                >
                  <Copy className="size-3" />
                  Copy Link
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function UsersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");

  const { data, isLoading, isError, error } = useUsers({
    q: q.trim(),
    role: role === "all" ? "" : role.trim(),
  });

  const rows = Array.isArray(data?.data) ? data.data : [];

  const visibleRoleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r && typeof r.role === "string") set.add(r.role);
    }
    set.add("ADMIN");
    set.add("RECRUITER");
    set.add("HIRING_MANAGER");
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-sm font-semibold text-primary mb-1 uppercase tracking-wider">
            Directory
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Users
          </h1>
          <p className="text-muted-foreground mt-2">
            View profiles that are visible to your role.
            {isAdmin ? " As an admin, you can invite new team members." : ""}
          </p>
        </div>
        {isAdmin && <InviteUserDialog />}
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-end">
            <div className="space-y-2">
              <Label>Search (name or email)</Label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. aditya or @company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="All visible roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All visible roles</SelectItem>
                  {visibleRoleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setQ("");
                  setRole("all");
                }}
                disabled={isLoading}
              >
                Reset Filters
              </Button>
            </div>
          </div>
          {isError ? (
            <div className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load users"}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
          <SpinnerGap className="size-8 animate-spin mb-4" />
          <p>Loading users...</p>
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              No users found for your current filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((u: any) => (
            <Link key={u.id} href={`/users/${u.id}`} className="group no-underline">
              <Card className="relative overflow-hidden transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)] hover:border-primary/50">
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/5 blur-3xl transition-colors group-hover:bg-primary/10"
                  aria-hidden
                />
                <CardContent className="p-6 relative flex min-w-0 items-center gap-4">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-muted">
                    {u.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                        {(u.name || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground group-hover:text-primary transition-colors">
                      {u.name || "—"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {u.email || "—"}
                    </p>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                      {roleLabel(u.role)}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground group-hover:text-primary transition-colors">
                    View →
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Invite management section — ADMIN only */}
      {isAdmin && (
        <>
          <Separator className="my-8" />
          <div className="mb-4">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Invitations
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Track sent invites and copy invite links for team members.
            </p>
          </div>
          <PendingInvites />
        </>
      )}
    </div>
  );
}
