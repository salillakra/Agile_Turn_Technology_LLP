"use client";

import { useState, useCallback } from "react";
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
  Kanban,
  List,
  ArrowRight,
  Buildings,
  CurrencyInr,
  Users,
  TrendUpIcon,
  BriefcaseIcon,
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
  useUpdateLeadStatus,
  useUpdateRequirementStatus,
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
  email?: string;
  phone?: string;
  expectedValue?: number;
  notes?: string;
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
  feeAmount?: number;
  currency?: string;
};
type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  amount: number;
  client?: { name: string };
};

// ─── Kanban column definitions ───────────────────────────────────────────────

const LEAD_COLUMNS: { id: string; label: string; color: string; bgColor: string }[] = [
  { id: "NEW", label: "New", color: "#60A5FA", bgColor: "rgba(96,165,250,.10)" },
  { id: "CONTACTED", label: "Contacted", color: "#A78BFA", bgColor: "rgba(167,139,250,.10)" },
  { id: "QUALIFIED", label: "Qualified", color: "#FBBF24", bgColor: "rgba(251,191,36,.10)" },
  { id: "CONVERTED", label: "Converted", color: "#34D399", bgColor: "rgba(52,211,153,.10)" },
  { id: "LOST", label: "Lost", color: "#9CA3AF", bgColor: "rgba(156,163,175,.10)" },
];

const REQ_COLUMNS: { id: string; label: string; color: string; bgColor: string }[] = [
  { id: "DRAFT", label: "Draft", color: "#9CA3AF", bgColor: "rgba(156,163,175,.10)" },
  { id: "OPEN", label: "Open", color: "#60A5FA", bgColor: "rgba(96,165,250,.10)" },
  { id: "ON_HOLD", label: "On Hold", color: "#FBBF24", bgColor: "rgba(251,191,36,.10)" },
  { id: "FILLED", label: "Filled", color: "#34D399", bgColor: "rgba(52,211,153,.10)" },
  { id: "CANCELLED", label: "Cancelled", color: "#FCA5A5", bgColor: "rgba(248,113,113,.10)" },
];

// ─── Helper components ────────────────────────────────────────────────────────

function StatusPill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: ".04em",
        color,
        background: bg,
        border: `1px solid ${color}33`,
      }}
    >
      {label}
    </span>
  );
}

function KanbanLeadCard({
  lead,
  columns,
  onMoveStatus,
  isPending,
  onConvert,
  convertPending,
}: {
  lead: Lead;
  columns: typeof LEAD_COLUMNS;
  onMoveStatus: (id: string, status: string) => void;
  isPending: boolean;
  onConvert: (id: string) => void;
  convertPending: boolean;
}) {
  const col = columns.find((c) => c.id === lead.status);
  return (
    <div
      className="flex flex-col gap-1.5 p-3 rounded-[10px] bg-card border border-border transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: "var(--foreground)", flex: 1 }}>
          {lead.companyName}
        </p>
        {col && <StatusPill label={col.label} color={col.color} bg={col.bgColor} />}
      </div>
      <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0 }}>
        {lead.contactName}
        {lead.email ? ` · ${lead.email}` : ""}
      </p>
      {lead.expectedValue != null && (
        <p style={{ fontSize: 11, color: "#34D399", margin: 0, fontWeight: 600 }}>
          ₹{lead.expectedValue.toLocaleString()}
        </p>
      )}
      {/* Move-to select */}
      <Select
        value={lead.status}
        onValueChange={(v) => v && onMoveStatus(lead.id, v as string)}
        disabled={isPending}
      >
        <SelectTrigger className="h-7 text-[11px] mt-1">
          <SelectValue placeholder="Move to…" />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {lead.status !== "CONVERTED" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 w-full justify-start px-1"
          onClick={() => onConvert(lead.id)}
          disabled={convertPending || isPending}
        >
          {convertPending ? (
            <SpinnerGap className="size-3 animate-spin mr-1" />
          ) : (
            <ArrowRight className="size-3 mr-1" />
          )}
          Convert to Client
        </Button>
      )}
    </div>
  );
}

function KanbanRequirementCard({
  req,
  columns,
  onMoveStatus,
  isPending,
  onActivate,
  activatePending,
}: {
  req: Requirement;
  columns: typeof REQ_COLUMNS;
  onMoveStatus: (id: string, status: string) => void;
  isPending: boolean;
  onActivate: (id: string) => void;
  activatePending: boolean;
}) {
  const col = columns.find((c) => c.id === req.status);
  return (
    <div
      className="flex flex-col gap-1.5 p-3 rounded-[10px] bg-card border border-border transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: "var(--foreground)", flex: 1 }}>
          {req.title}
        </p>
        {col && <StatusPill label={col.label} color={col.color} bg={col.bgColor} />}
      </div>
      {req.client?.name && (
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0 }}>
          <Buildings className="inline size-3 mr-1" />
          {req.client.name}
        </p>
      )}
      {req.feeAmount != null && (
        <p style={{ fontSize: 11, color: "#34D399", margin: 0, fontWeight: 600 }}>
          {req.currency || "INR"} {req.feeAmount.toLocaleString()}
        </p>
      )}
      {req.job?.title && (
        <p style={{ fontSize: 10, color: "#60A5FA", margin: 0 }}>
          Job: {req.job.title}
        </p>
      )}
      <Select
        value={req.status}
        onValueChange={(v) => v && onMoveStatus(req.id, v as string)}
        disabled={isPending}
      >
        <SelectTrigger className="h-7 text-[11px] mt-1">
          <SelectValue placeholder="Move to…" />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!req.jobId && req.status !== "FILLED" && req.status !== "CANCELLED" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 w-full justify-start px-1"
          onClick={() => onActivate(req.id)}
          disabled={activatePending || isPending}
        >
          {activatePending ? (
            <SpinnerGap className="size-3 animate-spin mr-1" />
          ) : (
            <Plus className="size-3 mr-1" />
          )}
          Activate → Create Job
        </Button>
      )}
    </div>
  );
}

// ─── Main Kanban Board ─────────────────────────────────────────────────────────

function LeadsKanban({
  leads,
  onMoveStatus,
  statusPending,
  onConvert,
  convertPending,
}: {
  leads: Lead[];
  onMoveStatus: (id: string, status: string) => void;
  statusPending: boolean;
  onConvert: (id: string) => void;
  convertPending: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${LEAD_COLUMNS.length}, minmax(200px, 1fr))`,
        gap: 12,
        overflowX: "auto",
        paddingBottom: 8,
      }}
    >
      {LEAD_COLUMNS.map((col) => {
        const colLeads = leads.filter((l) => l.status === col.id);
        return (
          <div key={col.id} style={{ minWidth: 200 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 10,
                padding: "6px 10px",
                borderRadius: 8,
                background: col.bgColor,
                border: `1px solid ${col.color}33`,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: col.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: col.color, flex: 1, letterSpacing: ".04em", textTransform: "uppercase" }}>
                {col.label}
              </span>
              <span style={{ fontSize: 11, color: col.color, fontWeight: 600 }}>
                {colLeads.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {colLeads.length === 0 ? (
                <div
                  style={{
                    border: `2px dashed ${col.color}33`,
                    borderRadius: 10,
                    padding: "24px 12px",
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                  }}
                >
                  No leads
                </div>
              ) : (
                colLeads.map((lead) => (
                  <KanbanLeadCard
                    key={lead.id}
                    lead={lead}
                    columns={LEAD_COLUMNS}
                    onMoveStatus={onMoveStatus}
                    isPending={statusPending}
                    onConvert={onConvert}
                    convertPending={convertPending}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RequirementsKanban({
  requirements,
  onMoveStatus,
  statusPending,
  onActivate,
  activatePending,
}: {
  requirements: Requirement[];
  onMoveStatus: (id: string, status: string) => void;
  statusPending: boolean;
  onActivate: (id: string) => void;
  activatePending: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${REQ_COLUMNS.length}, minmax(200px, 1fr))`,
        gap: 12,
        overflowX: "auto",
        paddingBottom: 8,
      }}
    >
      {REQ_COLUMNS.map((col) => {
        const colReqs = requirements.filter((r) => r.status === col.id);
        return (
          <div key={col.id} style={{ minWidth: 200 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 10,
                padding: "6px 10px",
                borderRadius: 8,
                background: col.bgColor,
                border: `1px solid ${col.color}33`,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: col.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: col.color, flex: 1, letterSpacing: ".04em", textTransform: "uppercase" }}>
                {col.label}
              </span>
              <span style={{ fontSize: 11, color: col.color, fontWeight: 600 }}>
                {colReqs.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {colReqs.length === 0 ? (
                <div
                  style={{
                    border: `2px dashed ${col.color}33`,
                    borderRadius: 10,
                    padding: "24px 12px",
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                  }}
                >
                  No requirements
                </div>
              ) : (
                colReqs.map((req) => (
                  <KanbanRequirementCard
                    key={req.id}
                    req={req}
                    columns={REQ_COLUMNS}
                    onMoveStatus={onMoveStatus}
                    isPending={statusPending}
                    onActivate={onActivate}
                    activatePending={activatePending}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main CRM page ─────────────────────────────────────────────────────────────

export default function Crm() {
  const [tab, setTab] = useState("overview");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [kanbanBoard, setKanbanBoard] = useState<"leads" | "requirements">("leads");

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
  const updateLeadStatus = useUpdateLeadStatus();
  const updateReqStatus = useUpdateRequirementStatus();

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

  const handleLeadStatusChange = useCallback(
    async (leadId: string, status: string) => {
      try {
        await updateLeadStatus.mutateAsync({ leadId, status });
        toast.success("Lead status updated.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Status update failed");
      }
    },
    [updateLeadStatus]
  );

  const handleReqStatusChange = useCallback(
    async (requirementId: string, status: string) => {
      try {
        await updateReqStatus.mutateAsync({ requirementId, status });
        toast.success("Requirement status updated.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Status update failed");
      }
    },
    [updateReqStatus]
  );

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
      <div className="flex flex-wrap items-center justify-between gap-4">
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

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setViewMode("list")}
          >
            <List className="size-3.5" />
            List View
          </Button>
          <Button
            variant={viewMode === "kanban" ? "default" : "ghost"}
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setViewMode("kanban")}
          >
            <Kanban className="size-3.5" />
            Pipeline View
          </Button>
        </div>
      </div>

      {/* ─── KANBAN VIEW ──────────────────────────────────────────── */}
      {viewMode === "kanban" && (
        <div className="flex flex-col gap-4">
          {/* Board selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={kanbanBoard === "leads" ? "default" : "outline"}
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setKanbanBoard("leads")}
            >
              <TrendUp className="size-3.5" />
              Leads Board
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                {leads.length}
              </Badge>
            </Button>
            <Button
              variant={kanbanBoard === "requirements" ? "default" : "outline"}
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setKanbanBoard("requirements")}
            >
              <Briefcase className="size-3.5" />
              Requirements Board
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                {requirements.length}
              </Badge>
            </Button>
          </div>

          {/* KPI mini-strip */}
          {summary && (
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Active Leads", value: summary.leadCount, icon: TrendUp, color: "#60A5FA" },
                { label: "Clients", value: summary.clientCount, icon: Buildings, color: "#A78BFA" },
                { label: "Open Requirements", value: summary.openRequirements, icon: Briefcase, color: "#FBBF24" },
                { label: "Closures", value: summary.closureCount, icon: Check, color: "#34D399" },
                {
                  label: "Paid Revenue",
                  value: `${summary.revenuePaid?.currency || "INR"} ${(summary.revenuePaid?.total || 0).toLocaleString()}`,
                  icon: CurrencyInr,
                  color: "#34D399",
                },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div
                    key={kpi.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderRadius: 10,
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      minWidth: 130,
                    }}
                  >
                    <Icon style={{ color: kpi.color, flexShrink: 0 }} className="size-4" />
                    <div>
                      <p style={{ fontSize: 10, color: "var(--muted-foreground)", margin: 0, textTransform: "uppercase", letterSpacing: ".04em" }}>
                        {kpi.label}
                      </p>
                      <p style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                        {kpi.value}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : kanbanBoard === "leads" ? (
            <LeadsKanban
              leads={leads}
              onMoveStatus={handleLeadStatusChange}
              statusPending={updateLeadStatus.isPending}
              onConvert={handleConvertLead}
              convertPending={convertLead.isPending}
            />
          ) : (
            <RequirementsKanban
              requirements={requirements}
              onMoveStatus={handleReqStatusChange}
              statusPending={updateReqStatus.isPending}
              onActivate={handleActivateRequirement}
              activatePending={activateRequirement.isPending}
            />
          )}
        </div>
      )}

      {/* ─── LIST / TABS VIEW ─────────────────────────────────────── */}
      {viewMode === "list" && (
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
                    icon: TrendUpIcon,
                  },
                  {
                    label: "Active Clients",
                    value: summary.clientCount,
                    icon: BriefcaseIcon,
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
                    <div className="flex items-center gap-2">
                      <Select
                        value={l.status}
                        onValueChange={(v) => v && handleLeadStatusChange(l.id, v as string)}
                        disabled={updateLeadStatus.isPending}
                      >
                        <SelectTrigger className="h-8 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_COLUMNS.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      value={reqForm.clientId || null}
                      onValueChange={(v) =>
                        setReqForm((p) => ({ ...p, clientId: (v as string) || "" }))
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
                    <div className="flex items-center gap-2">
                      <Select
                        value={r.status}
                        onValueChange={(v) => v && handleReqStatusChange(r.id, v as string)}
                        disabled={updateReqStatus.isPending}
                      >
                        <SelectTrigger className="h-8 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REQ_COLUMNS.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
      )}
    </div>
  );
}
