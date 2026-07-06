# OpenResume parser (vendored)

Rule-based PDF resume parsing uses the [OpenResume](https://www.open-resume.com/resume-parser) algorithm from:

- **Source:** https://github.com/xitanggg/open-resume
- **License:** GNU Affero General Public License v3.0 — see `OPEN-RESUME-AGPL-LICENSE.txt`

Vendored under `parse-resume-from-pdf/` with Node.js adaptations (`read-pdf-node.ts` + `pdfjs-dist`).

**Algorithm (4 steps):** pdf.js text items → line grouping → section detection → feature-scoring extraction.

Used by `src/lib/resume-parse/rule-based-parse.ts` for PDF uploads; DOCX/DOC still use plain-text heuristics.
