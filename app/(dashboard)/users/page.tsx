"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useUsers } from "@/hooks/queries/useUsers";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SpinnerGap } from "@phosphor-icons/react";

function roleLabel(role: string) {
  if (role === "HIRING_MANAGER") return "Hiring manager";
  if (role === "RECRUITER") return "Recruiter";
  if (role === "ADMIN") return "Admin";
  return role || "—";
}

export default function UsersPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  
  // Debounce the query optionally or just pass it to the hook. We'll pass it directly for now.
  // In a real app we might debounce q before passing to the query.
  const { data, isLoading, isError, error } = useUsers({
    q: q.trim(),
    role: role === "all" ? "" : role.trim(),
  });

  const rows = Array.isArray(data?.data) ? data.data : [];

  const visibleRoleOptions = useMemo(() => {
    const set = new Set<string>();
    // Note: Since TanStack query updates data when `role` filter changes, 
    // the available roles might shrink if we filter. 
    // Usually we get a full list of roles from another endpoint or hardcode them.
    // For now, we extract them from rows if we want, but it's better to hardcode or use the ones from rows + defaults.
    for (const r of rows) {
      if (r && typeof r.role === "string") set.add(r.role);
    }
    // ensure standard roles are there just in case
    set.add("ADMIN");
    set.add("RECRUITER");
    set.add("HIRING_MANAGER");
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto w-full">
      <div className="mb-6">
        <p className="text-sm font-semibold text-primary mb-1 uppercase tracking-wider">Directory</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Users</h1>
        <p className="text-muted-foreground mt-2">
          View profiles that are visible to your role. Editing is only available from your own profile page.
        </p>
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
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
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
            <p className="text-sm text-muted-foreground">No users found for your current filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((u: any) => (
            <Link
              key={u.id}
              href={`/users/${u.id}`}
              className="group no-underline"
            >
              <Card className="relative overflow-hidden transition-all hover:shadow-md hover:border-primary/50">
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/5 blur-3xl transition-colors group-hover:bg-primary/10" aria-hidden />
                <CardContent className="p-6 relative flex min-w-0 items-center gap-4">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-muted">
                    {u.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                        {(u.name || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground group-hover:text-primary transition-colors">{u.name || "—"}</p>
                    <p className="truncate text-sm text-muted-foreground">{u.email || "—"}</p>
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
    </div>
  );
}
