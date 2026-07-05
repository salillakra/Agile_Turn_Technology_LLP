"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bank,
  TrendUp,
  Briefcase,
  Plus,
  Check,
  SpinnerGap,
  Table,
} from "@phosphor-icons/react";
import {
  useCrmSummary,
  useCrmLeads,
  useCrmClients,
  useCrmRequirements,
  useCrmInvoices,
  useCreateLead,
  useConvertLead,
  useCreateClient,
  useCreateRequirement,
  useActivateRequirement,
  useMarkInvoicePaid,
} from "@/hooks/queries/useApplicants";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "leads", label: "Leads" },
  { id: "clients", label: "Clients" },
  { id: "requirements", label: "Requirements" },
  { id: "invoices", label: "Invoices" },
] as const;

type CrmSummary = {
  leadCount: number;
  clientCount: number;
  openRequirements: number;
  closureCount: number;
  revenuePaid?: { currency: string; total: number };
  revenueOutstanding?: { currency: string; total: number };
};

type Lead = {
  id: string;
  companyName: string;
  contactName: string;
  status: string;
};
type Client = {
  id: string;
  name: string;
  industry?: string;
  status: string;
  _count?: { requirements: number; contacts: number };
};
type Requirement = {
  id: string;
  title: string;
  status: string;
  jobId?: string;
  job?: { title: string };
  client?: { name: string };
};
type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  amount: number;
  client?: { name: string };
};

export default function Crm() {
  const [tab, setTab] = useState("overview");

  const [leadForm, setLeadForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
  });
  const [clientForm, setClientForm] = useState({
    name: "",
    industry: "",
    billingEmail: "",
  });
  const [reqForm, setReqForm] = useState({
    clientId: "",
    title: "",
    feeAmount: "",
    department: "",
    location: "",
  });

  // Queries
  const summaryQ = useCrmSummary();
  const leadsQ = useCrmLeads();
  const clientsQ = useCrmClients();
  const reqsQ = useCrmRequirements();
  const invQ = useCrmInvoices();

  const isLoading = summaryQ.isLoading || leadsQ.isLoading;

  // Mutations
  const createLead = useCreateLead();
  const convertLead = useConvertLead();
  const createClient = useCreateClient();
  const createRequirement = useCreateRequirement();
  const activateRequirement = useActivateRequirement();
  const markPaid = useMarkInvoicePaid();

  async function handleCreateLead() {
    try {
      await createLead.mutateAsync(leadForm);
      setLeadForm({ companyName: "", contactName: "", email: "", phone: "" });
      toast.success("Lead created.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create lead failed");
    }
  }

  async function handleConvertLead(leadId: string) {
    try {
      const body = (await convertLead.mutateAsync(leadId)) as { name: string };
      toast.success(`Lead converted to client "${body?.name}".`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Convert failed");
    }
  }

  async function handleCreateClient() {
    try {
      await createClient.mutateAsync(clientForm);
      setClientForm({ name: "", industry: "", billingEmail: "" });
      toast.success("Client created.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create client failed");
    }
  }

  async function handleCreateRequirement() {
    try {
      await createRequirement.mutateAsync({
        ...reqForm,
        feeAmount: reqForm.feeAmount ? Number(reqForm.feeAmount) : null,
      });
      setReqForm({
        clientId: "",
        title: "",
        feeAmount: "",
        department: "",
        location: "",
      });
      toast.success("Requirement created.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create requirement failed");
    }
  }

  async function handleActivateRequirement(requirementId: string) {
    try {
      const body = (await activateRequirement.mutateAsync(requirementId)) as {
        jobId?: string;
        job?: { id: string };
      };
      toast.success(
        `Requirement activated — Job ${body?.jobId ?? body?.job?.id ?? ""} created.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activate failed");
    }
  }

  async function handleMarkPaid(invoiceId: string) {
    try {
      await markPaid.mutateAsync(invoiceId);
      toast.success("Invoice marked paid.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update invoice failed");
    }
  }

  const summary = summaryQ.data as CrmSummary | undefined;
  const leads = (leadsQ.data as Lead[]) ?? [];
  const clients = (clientsQ.data as Client[]) ?? [];
  const requirements = (reqsQ.data as Requirement[]) ?? [];
  const invoices = (invQ.data as Invoice[]) ?? [];

  return (
    <div
      className="flex flex-col gap-6"
      role="region"
      aria-label="Recruitment CRM"
    >
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          CRM
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Recruitment CRM</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage pipelines: Lead → Client → Requirement → Submission → Closure →
          Invoice
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="w-full flex flex-col gap-4"
      >
        <TabsList className="flex-wrap gap-2 rounded-xl">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="text-xs cursor-pointer whitespace-nowrap p-2"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {isLoading && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        )}

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          {summary && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  label: "Active Leads",
                  value: summary.leadCount,
                  icon: TrendUp,
                },
                {
                  label: "Active Clients",
                  value: summary.clientCount,
                  icon: Briefcase,
                },
                {
                  label: "Open Requirements",
                  value: summary.openRequirements,
                  icon: Table,
                },
                { label: "Closures", value: summary.closureCount, icon: Check },
                {
                  label: "Paid Revenue",
                  value: `${summary.revenuePaid?.currency || "INR"} ${summary.revenuePaid?.total || 0}`,
                  icon: Bank,
                },
                {
                  label: "Outstanding Revenue",
                  value: `${summary.revenueOutstanding?.currency || "INR"} ${summary.revenueOutstanding?.total || 0}`,
                  icon: Bank,
                },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <Card
                    key={kpi.label}
                    className="transition-all hover:shadow-md"
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {kpi.label}
                      </CardTitle>
                      <Icon className="size-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <p className="text-2xl font-bold tabular-nums">
                        {kpi.value}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Leads */}
        <TabsContent value="leads" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Add New Lead
              </CardTitle>
              <CardDescription>
                Register a new sales or hiring lead
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  {
                    id: "companyName",
                    label: "Company Name",
                    key: "companyName" as const,
                  },
                  {
                    id: "contactName",
                    label: "Contact Name",
                    key: "contactName" as const,
                  },
                  {
                    id: "lead-email",
                    label: "Email",
                    key: "email" as const,
                    type: "email",
                  },
                  { id: "phone", label: "Phone", key: "phone" as const },
                ].map(({ id, label, key, type }) => (
                  <div key={id} className="flex flex-col gap-1.5">
                    <Label htmlFor={id}>{label}</Label>
                    <Input
                      id={id}
                      type={type}
                      value={leadForm[key]}
                      onChange={(e) =>
                        setLeadForm((p) => ({ ...p, [key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                onClick={handleCreateLead}
                disabled={createLead.isPending}
                className="gap-2 w-fit"
              >
                {createLead.isPending ? (
                  <SpinnerGap
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                Add Lead
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Active Leads
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {leads.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No leads yet.
                </p>
              )}
              {leads.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-semibold">{l.companyName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {l.contactName} · {l.status}
                    </p>
                  </div>
                  {l.status !== "CONVERTED" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConvertLead(l.id)}
                      disabled={convertLead.isPending}
                      className="h-8 text-xs font-semibold"
                    >
                      {convertLead.isPending ? (
                        <SpinnerGap className="size-3 animate-spin mr-1" />
                      ) : null}
                      Convert to Client
                    </Button>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-600 border-emerald-500/20 bg-emerald-500/5"
                    >
                      Converted
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clients */}
        <TabsContent value="clients" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Add New Client
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="c-name">Client Name</Label>
                  <Input
                    id="c-name"
                    value={clientForm.name}
                    onChange={(e) =>
                      setClientForm((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="c-ind">Industry</Label>
                  <Input
                    id="c-ind"
                    value={clientForm.industry}
                    onChange={(e) =>
                      setClientForm((p) => ({ ...p, industry: e.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="c-mail">Billing Email</Label>
                  <Input
                    id="c-mail"
                    value={clientForm.billingEmail}
                    onChange={(e) =>
                      setClientForm((p) => ({
                        ...p,
                        billingEmail: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleCreateClient}
                disabled={createClient.isPending}
                className="gap-2 w-fit"
              >
                {createClient.isPending ? (
                  <SpinnerGap
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                Add Client
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Clients List
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {clients.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No clients yet.
                </p>
              )}
              {clients.map((c) => (
                <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.industry || "General"} · {c.status} ·{" "}
                    {c._count?.requirements ?? 0} requirements ·{" "}
                    {c._count?.contacts ?? 0} contacts
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requirements */}
        <TabsContent value="requirements" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                New Job Requirement
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-client">Client</Label>
                  <Select
                    value={reqForm.clientId}
                    onValueChange={(v) =>
                      setReqForm((p) => ({ ...p, clientId: v }))
                    }
                  >
                    <SelectTrigger id="req-client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-title">Requirement Title</Label>
                  <Input
                    id="req-title"
                    value={reqForm.title}
                    onChange={(e) =>
                      setReqForm((p) => ({ ...p, title: e.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-fee">Fee Amount</Label>
                  <Input
                    id="req-fee"
                    type="number"
                    value={reqForm.feeAmount}
                    onChange={(e) =>
                      setReqForm((p) => ({ ...p, feeAmount: e.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-dept">Department</Label>
                  <Input
                    id="req-dept"
                    value={reqForm.department}
                    onChange={(e) =>
                      setReqForm((p) => ({ ...p, department: e.target.value }))
                    }
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleCreateRequirement}
                disabled={createRequirement.isPending}
                className="gap-2 w-fit"
              >
                {createRequirement.isPending ? (
                  <SpinnerGap
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                Add Requirement
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Active Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {requirements.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No requirements yet.
                </p>
              )}
              {requirements.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.client?.name} · {r.status}{" "}
                      {r.job ? `· Job: ${r.job.title}` : ""}
                    </p>
                  </div>
                  {!r.jobId && r.status !== "FILLED" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleActivateRequirement(r.id)}
                      disabled={activateRequirement.isPending}
                      className="h-8 text-xs font-semibold"
                    >
                      {activateRequirement.isPending ? (
                        <SpinnerGap className="size-3 animate-spin mr-1" />
                      ) : null}
                      Activate → Create Job
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Invoices</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {invoices.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No invoices yet.
                </p>
              )}
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-semibold">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inv.client?.name} · {inv.currency} {Number(inv.amount)} ·{" "}
                      {inv.status}
                    </p>
                  </div>
                  {inv.status !== "PAID" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMarkPaid(inv.id)}
                      disabled={markPaid.isPending}
                      className="h-8 text-xs font-semibold"
                    >
                      {markPaid.isPending ? (
                        <SpinnerGap className="size-3 animate-spin mr-1" />
                      ) : null}
                      Mark Paid
                    </Button>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-600 border-emerald-500/20 bg-emerald-500/5"
                    >
                      Paid
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
