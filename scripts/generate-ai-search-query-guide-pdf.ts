/**
 * Generate docs/AI_SEARCH_QUERY_GUIDE.pdf from the recruiter query guide content.
 *
 * Usage: node --env-file=.env ./node_modules/.bin/tsx scripts/generate-ai-search-query-guide-pdf.ts
 */
import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "docs", "AI_SEARCH_QUERY_GUIDE.pdf");
const BRAND = "#0f766e";
const INK = "#0f172a";
const MUTED = "#475569";
const RULE = "#cbd5e1";

function h1(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.6);
  doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(16).text(text);
  doc.moveDown(0.25);
  doc.fillColor(INK);
}

function h2(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.45);
  doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(12).text(text);
  doc.moveDown(0.2);
  doc.fillColor(INK);
}

function body(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica").fontSize(10).fillColor(INK).text(text, { align: "left", lineGap: 2 });
  doc.moveDown(0.25);
}

function bullet(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica").fontSize(10).fillColor(INK).text(`•  ${text}`, { indent: 8, lineGap: 1.5 });
}

function mono(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Courier").fontSize(9).fillColor(INK).text(text, { indent: 10, lineGap: 1 });
  doc.moveDown(0.2);
}

function tableRow(
  doc: PDFKit.PDFDocument,
  left: string,
  right: string,
  opts?: { header?: boolean }
) {
  const y = doc.y;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const col1 = pageWidth * 0.42;
  const col2 = pageWidth * 0.58;
  doc.font(opts?.header ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts?.header ? 9 : 8.5)
    .fillColor(opts?.header ? BRAND : INK);
  doc.text(left, doc.page.margins.left, y, { width: col1 - 6, continued: false });
  const y1 = doc.y;
  doc.text(right, doc.page.margins.left + col1, y, { width: col2 });
  const y2 = doc.y;
  doc.y = Math.max(y1, y2) + 4;
  doc
    .strokeColor(RULE)
    .lineWidth(0.4)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.15);
}

async function main() {
  await mkdir(path.dirname(OUT), { recursive: true });
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 52, left: 48, right: 48 },
    info: {
      Title: "Agile Turn — AI Candidate Search Query Guide",
      Author: "Agile Turn Technology LLP",
      Subject: "Recruiter guide for natural-language AI candidate search",
    },
  });
  const stream = createWriteStream(OUT);
  doc.pipe(stream);

  // Cover header
  doc.rect(0, 0, doc.page.width, 92).fill(BRAND);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20);
  doc.text("Agile Turn", 48, 28);
  doc.font("Helvetica").fontSize(11).text("Recruitment Suite", 48, 54);
  doc.font("Helvetica-Bold").fontSize(14).text("AI Candidate Search — Query Guide", 48, 70);
  doc.y = 110;
  doc.fillColor(MUTED).font("Helvetica").fontSize(9);
  doc.text("For Recruiters, Hiring Managers & Admins  ·  July 2026");
  doc.moveDown(0.8);
  doc.fillColor(INK);

  h1(doc, "1. What the search does");
  body(
    doc,
    "Type a natural-language query. Agile Turn extracts skills, years, and location; hard-filters matching candidates; recalls with semantic (meaning) and full-text (exact words) search; fuses both with Reciprocal Rank Fusion; then re-ranks by skill, experience, and location fit."
  );

  h1(doc, "2. Best query formula");
  mono(doc, "[Role / specialty] + [1–3 known skills] + [years] + [location]");
  doc.moveDown(0.2);
  tableRow(doc, "Example query", "Filters applied", { header: true });
  tableRow(doc, "React developer Bangalore 5 years", "react · ≥5 yrs · bangalore");
  tableRow(doc, "Python AWS remote 3+ years", "python, aws · ≥3 yrs · remote");
  tableRow(doc, "Node.js TypeScript in Hyderabad", "nodejs, typescript · hyderabad");
  tableRow(doc, "Senior Java Spring Boot", "Soft rank only for Spring Boot (not a hard alias)");

  h2(doc, "Tips");
  bullet(doc, "Prefer 2–4 concrete terms over long paragraphs.");
  bullet(doc, "Name must-have skills explicitly (React, Python, AWS…).");
  bullet(doc, "Add years when seniority matters (5 years, 3+ years, minimum 4 years).");
  bullet(doc, "Add location with “in …”, “based in …”, or remote / hybrid / wfh.");
  bullet(doc, "Do not list every nice-to-have — known skills become hard must-haves (max 5).");

  h1(doc, "3. Hard filters vs soft ranking");
  tableRow(doc, "Signal", "Behavior", { header: true });
  tableRow(doc, "Known skills (alias list)", "Hard — must have ALL detected (up to 5)");
  tableRow(doc, "Years of experience", "Hard — total_experience ≥ N when detected");
  tableRow(doc, "Location", "Hard — preferred location contains the hint");
  tableRow(doc, "Other words / job titles", "Soft — semantic + full-text ranking only");
  body(
    doc,
    "Too few results → loosen (drop a skill, years, or location). Too broad → add a known skill, years, or “in <city>”."
  );

  h1(doc, "4. Experience phrases");
  bullet(doc, "5 years / 5 yrs");
  bullet(doc, "5+ years");
  bullet(doc, "5 years of experience");
  bullet(doc, "at least 5 years · minimum 5 years · min 5 years");

  h1(doc, "5. Location phrases");
  bullet(doc, "in Bangalore · based in Pune · located in Mumbai · from Delhi");
  bullet(doc, "remote · wfh · work from home · hybrid");
  body(doc, "Matching is a simple contains check on preferred work location — keep city names plain.");

  h1(doc, "6. Known skills (hard-filter aliases)");
  body(
    doc,
    "Only these (and common spellings like React.js, Node JS, k8s) become hard must-haves. Other skills still help ranking via text/semantic search."
  );
  bullet(doc, "Frontend/JS: react, vue, angular, svelte, nextjs, javascript, typescript, nodejs");
  bullet(doc, "Languages: python, java, kotlin, go, rust, csharp, cpp");
  bullet(doc, "Data/backend: postgresql, mysql, mongodb, redis, graphql, rest");
  bullet(doc, "Cloud/DevOps: aws, azure, gcp, docker, kubernetes, terraform, cicd");
  bullet(doc, "Practices: agile, scrum, git, github, gitlab");
  body(
    doc,
    "Aliases: React.js→react · Node JS→nodejs · amazon web services→aws · k8s→kubernetes · C#→csharp"
  );

  h1(doc, "7. Good vs weak queries");
  h2(doc, "Prefer");
  mono(doc, "React TypeScript Bangalore 4 years");
  mono(doc, "Python data engineer remote 5+ years");
  mono(doc, "Java AWS Docker in Pune minimum 3 years");
  h2(doc, "Avoid");
  body(
    doc,
    "Vague essays (“really strong full stack who knows everything”) — few hard signals. Long laundry lists of every skill — almost nobody matches all hard filters."
  );

  h1(doc, "8. Reading results");
  bullet(doc, "Final score — blend of semantic fit, skill overlap, experience, location.");
  bullet(doc, "Recommendation reason — short “why this person” explanation.");
  bullet(doc, "Parsed intent (must-have skills, years, location) — verify filters when debugging empty results.");

  h1(doc, "9. Privacy & scope");
  body(
    doc,
    "Search returns only candidates in your data silo (owned candidates). Admins see the full tenant. Job assignments do not grant search access to another user’s candidates."
  );

  h1(doc, "10. Quick checklist");
  bullet(doc, "Named 1–3 known skills");
  bullet(doc, "Added years if seniority matters");
  bullet(doc, "Added city or remote if location matters");
  bullet(doc, "Kept the query short and specific");
  bullet(doc, "If empty → remove one hard constraint and search again");

  doc.moveDown(1.2);
  doc
    .strokeColor(RULE)
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor(MUTED).font("Helvetica").fontSize(8);
  doc.text("Agile Turn Technology LLP — Recruitment Suite");
  doc.text("Internal guide for AI candidate search  ·  docs/AI_SEARCH_QUERY_GUIDE.md");

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
