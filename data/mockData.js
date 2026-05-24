import { uid, rnd, pick } from "@/lib/helpers";

export const DEPARTMENTS = [
  "Engineering", "Product", "Design", "Marketing", "Sales", "Operations", "HR", "Finance",
];
export const LOCATIONS = [
  "Remote", "New York", "San Francisco", "London", "Austin", "Chicago", "Berlin",
];
export const STAGES = [
  "Applied", "Screening", "Interview", "Technical", "Final Round", "Offer Sent", "Hired", "Rejected",
];
export const SOURCES = [
  "LinkedIn", "Indeed", "Referral", "Company Website", "Glassdoor", "Headhunter", "Other",
];
/** Map dashboard funnel labels → `GET /api/applications?stage=` (Prisma `ApplicationStage`). */
export const STAGE_LABEL_TO_API = {
  Applied: "APPLIED",
  Screening: "SCREENING",
  Interview: "INTERVIEW",
  Technical: "TECHNICAL",
  "Final Round": "FINAL_ROUND",
  "Offer Sent": "OFFER_SENT",
  Hired: "HIRED",
  Rejected: "REJECTED",
};

/** Map source labels → `GET /api/applications?source=` (Prisma `CandidateSource`). */
export const SOURCE_LABEL_TO_API = {
  LinkedIn: "LINKEDIN",
  Indeed: "INDEED",
  Referral: "REFERRAL",
  "Company Website": "COMPANY_WEBSITE",
  Glassdoor: "GLASSDOOR",
  Headhunter: "HEADHUNTER",
  Other: "OTHER",
};

export const STAGE_META = {
  Applied: { color: "#60A5FA", bg: "rgba(96,165,250,.12)", order: 0 },
  Screening: { color: "#A78BFA", bg: "rgba(167,139,250,.12)", order: 1 },
  Interview: { color: "#FB923C", bg: "rgba(251,146,60,.12)", order: 2 },
  Technical: { color: "#FBBF24", bg: "rgba(251,191,36,.12)", order: 3 },
  "Final Round": { color: "#F472B6", bg: "rgba(244,114,182,.12)", order: 4 },
  "Offer Sent": { color: "#34D399", bg: "rgba(52,211,153,.12)", order: 5 },
  Hired: { color: "#10B981", bg: "rgba(16,185,129,.18)", order: 6 },
  Rejected: { color: "#F87171", bg: "rgba(248,113,113,.12)", order: 7 },
};
export const NAMES = [
  "Aisha Patel", "Marcus Chen", "Sofia Oliveira", "James Nakamura", "Priya Singh", "Luca Ferrari",
  "Elena Vasquez", "Omar Hassan", "Chloe Kim", "Daniel Osei", "Yuki Tanaka", "Fatima Al-Rashid",
  "Noah Williams", "Isabella Rossi", "Kwame Mensah", "Mei Lin", "Raj Kumar", "Amara Diallo",
  "Tyler Brooks", "Zara Ahmed", "Henrik Larsen", "Nadia Petrov", "Carlos Mendez", "Aya Yamamoto",
  "Samuel Adeyemi", "Grace O'Brien", "Arjun Sharma", "Layla Hassan", "Ben Kowalski", "Mia Torres",
];
export const JOBS = [
  { id: "j1", title: "Senior Full-Stack Engineer", dept: "Engineering", loc: "Remote", openings: 3, joining: "2026-05-01", salary: "$140k–$170k", posted: "2026-01-10", status: "Open" },
  { id: "j2", title: "Product Manager", dept: "Product", loc: "New York", openings: 1, joining: "2026-04-15", salary: "$120k–$145k", posted: "2026-01-15", status: "Open" },
  { id: "j3", title: "UX Designer", dept: "Design", loc: "San Francisco", openings: 2, joining: "2026-05-15", salary: "$100k–$125k", posted: "2026-01-20", status: "Open" },
  { id: "j4", title: "Data Scientist", dept: "Engineering", loc: "Remote", openings: 2, joining: "2026-06-01", salary: "$130k–$160k", posted: "2026-01-25", status: "Open" },
  { id: "j5", title: "Sales Director", dept: "Sales", loc: "Chicago", openings: 1, joining: "2026-04-01", salary: "$160k–$200k", posted: "2026-02-01", status: "Open" },
  { id: "j6", title: "Marketing Manager", dept: "Marketing", loc: "Austin", openings: 1, joining: "2026-05-01", salary: "$90k–$115k", posted: "2026-02-05", status: "Paused" },
  { id: "j7", title: "DevOps Engineer", dept: "Engineering", loc: "Remote", openings: 2, joining: "2026-05-15", salary: "$125k–$155k", posted: "2026-02-10", status: "Open" },
  { id: "j8", title: "HR Business Partner", dept: "HR", loc: "New York", openings: 1, joining: "2026-04-15", salary: "$85k–$105k", posted: "2026-02-12", status: "Open" },
];
export const genApplicants = () =>
  NAMES.map((name) => {
    const job = pick(JOBS);
    const stageIdx = rnd(0, STAGES.length - 1);
    const stage = STAGES[stageIdx];
    const appliedDate = new Date(2026, 0, rnd(10, 60));
    appliedDate.setDate(appliedDate.getDate() + rnd(0, 50));
    const lastActivity = new Date(appliedDate);
    lastActivity.setDate(lastActivity.getDate() + rnd(1, 14));
    return {
      id: uid(),
      name,
      email: `${name.split(" ")[0].toLowerCase()}@email.com`,
      phone: `+1-555-${String(rnd(1000, 9999))}`,
      jobId: job.id,
      jobTitle: job.title,
      dept: job.dept,
      stage,
      source: pick(SOURCES),
      rating: rnd(2, 5),
      appliedDate: appliedDate.toISOString().split("T")[0],
      lastActivity: lastActivity.toISOString().split("T")[0],
      notes: stage === "Hired" ? "Excellent fit, accepted offer." : stage === "Rejected" ? "Not enough experience." : "In progress.",
      tags: [pick(["React", "Python", "SQL", "AWS", "Go", "Java", "Figma", "Excel"]), pick(["Leadership", "Agile", "Strategy", "Analytics"])],
      ttFill: rnd(14, 75),
    };
  });
