import { config } from './config.js';

// ===========================================================================
// UNIVERSAL PARSER
// Handles heterogeneous college tabs (marks / CIA-ESE / grade-points / MID /
// Theory-IA) by detecting the header shape generically:
//   - 1- or 2-row header (subject group names in row 0, metric labels in row 1)
//   - identity columns (UID / Name / roll / reg / etc.), UID found by label OR
//     by value pattern (handles the tab whose "UID" column is blank)
//   - subject groups (column spans), each with its own raw metrics
// It captures EVERY raw metric as JSONB and derives a normalized layer
// (total_pct, passed, grade, score) where possible.
// ===========================================================================

export interface ParsedSubject {
  position: number;
  name: string | null;
  metrics: Record<string, string | number>;
  internal: number | null;
  external: number | null;
  total: number | null;   // total percentage-ish (0..100) when derivable
  score: number | null;   // headline number (total, or grade point, ...)
  grade: string | null;   // letter grade when present
  passed: boolean | null;
}

export interface ParsedStudent {
  uid: string;
  fullName: string | null;
  universityId: string | null;
  bitsId: string | null;
  identity: Record<string, string>;
  subjects: ParsedSubject[];
  cgpa: number | null;
  totalPct: number | null;
  subjectsFailed: number | null;
  overall: 'pass' | 'fail' | 'in_progress';
  dataComplete: boolean;
  flagged: boolean;
  flagReason: string | null;
  raw: Record<string, string>;
}

export interface ParsedTab {
  format: string;
  subjectNames: (string | null)[];
  students: ParsedStudent[];
  warnings: string[];
}

const norm = (s: unknown) => (s == null ? '' : String(s)).trim();
const lc = (s: unknown) => norm(s).toLowerCase();

function num(v: unknown): number | null {
  const t = norm(v).replace('%', '').replace(/,/g, '');
  if (t === '' || /^(na|n\/a|-|nil|absent|ab)$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function passFail(v: unknown): boolean | null {
  const t = lc(v);
  if (t === '') return null;
  if (/^(pass|passed|p|clear|cleared|yes|y|promoted|eligible)$/.test(t)) return true;
  if (/^(fail|failed|f|no|n|ra|detained|ab|absent)$/.test(t)) return false;
  return null;
}

// ---- patterns ----
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIAT_RE = /^N\d{2}[A-Z]\d{2}[A-Z]\d{3,4}$/i;                 // N25H02B0198
const ROLL_RE = /^\d{2}[A-Z][A-Z0-9]{4,}$/i;                       // 25KN1A4420, 25BTCSEAI001
const isUidValue = (s: string) => UUID_RE.test(s) || NIAT_RE.test(s) || ROLL_RE.test(s);

const ID_LABEL = /^(s\.?\s*no\.?|sl\.?\s*no\.?|uid|u\.?i\.?d\.?|name|student\s*name|student\s*uid|univ(ersity)?\.?\s*id|admission\s*no\.?|reg(istration)?\.?\s*(no\.?|number)?|roll\s*(no\.?|number)?|niat\s*id|bits\s*id|campus\s*id|section'?s?|section\s*code|class\s*room.*|batch|program|branch|id)$/i;
const SUMMARY_LABEL = /(total\s*cgpa|c?gpa|tgpa|sgpa|overall|subjects?\s*failed|no\.?\s*of\s*subjects|total\s*marks|total\s*credits?|total\s*points?|total\s*%$|total\s*percentage|grand\s*total|^result$)/i;
const isIdentity = (label: string) => ID_LABEL.test(norm(label));

function cleanSubjectName(raw: string): string | null {
  let s = norm(raw);
  if (!s || /mention subject name here|^\[subject/i.test(s)) return null;
  s = s.split(/\s*[-–]\s*\[/)[0];  // strip " - [CODE]"
  s = s.split('\n')[0];             // strip "\n(100)"
  s = s.replace(/\s*\(\d+\)\s*$/, '').trim();
  return s || null;
}

function looksLikeDataRow(row: string[]): boolean {
  const cells = row.map(norm);
  if (cells.some((c) => isUidValue(c))) return true;
  const nonEmpty = cells.filter(Boolean);
  if (nonEmpty.length < 2) return false;
  const numeric = nonEmpty.filter((c) => /^-?\d+(\.\d+)?$/.test(c)).length;
  return numeric / nonEmpty.length > 0.4;
}

function forwardFill(row: string[], width: number): string[] {
  const out: string[] = [];
  let last = '';
  for (let i = 0; i < width; i++) {
    const v = norm(row[i]);
    if (v) last = v;
    out.push(last);
  }
  return out;
}

export function parseTab(grid: string[][]): ParsedTab {
  const warnings: string[] = [];
  if (grid.length < 2) return { format: 'empty', subjectNames: [], students: [], warnings: ['tab has no data rows'] };

  // 1) Find where data starts (1- or 2-row header)
  let dataStart = -1;
  for (let r = 1; r < Math.min(grid.length, 5); r++) {
    if (looksLikeDataRow(grid[r])) { dataStart = r; break; }
  }
  if (dataStart < 0) return { format: 'empty', subjectNames: [], students: [], warnings: ['no data rows detected'] };

  const width = Math.max(...grid.slice(0, dataStart + 3).map((r) => r.length));
  const labelRow = grid[dataStart - 1] ?? [];
  const groupRow = dataStart >= 2 ? forwardFill(grid[0], width) : null;
  const fl = (c: number) => norm(labelRow[c]);
  const gl = (c: number) => (groupRow ? groupRow[c] : '');

  // 2) Identity columns = leading run that are identity (by label) — else where subjects start
  let subjectStart = -1;
  for (let c = 0; c < width; c++) {
    const label = fl(c) || gl(c);
    const groupIsSubject = groupRow ? (gl(c) && !isIdentity(gl(c))) : (!!fl(c) && !isIdentity(fl(c)));
    const labelIsMetric = !!fl(c) && !isIdentity(fl(c));
    if (groupIsSubject && (groupRow ? labelIsMetric || true : labelIsMetric) && !isIdentity(label)) {
      subjectStart = c; break;
    }
  }
  if (subjectStart < 0) return { format: 'unknown', subjectNames: [], students: [], warnings: ['could not locate subject columns'] };

  // 3) Build subject groups + locate summary columns
  interface Group { name: string | null; cols: number[] }
  const groups: Group[] = [];
  const summaryCols: number[] = [];

  if (groupRow) {
    let cur: Group | null = null;
    let curKey = '';
    for (let c = subjectStart; c < width; c++) {
      if (!fl(c) && !gl(c)) continue;
      if (SUMMARY_LABEL.test(fl(c)) || SUMMARY_LABEL.test(gl(c))) { summaryCols.push(c); continue; }
      const key = gl(c) || `col${c}`;
      if (key !== curKey) { cur = { name: cleanSubjectName(gl(c)), cols: [] }; groups.push(cur); curKey = key; }
      cur!.cols.push(c);
    }
  } else {
    // single-row header (e.g. CDU): group ends at a "pass"/"semester pass" terminator
    let cur: Group | null = null;
    for (let c = subjectStart; c < width; c++) {
      if (!fl(c)) continue;
      if (SUMMARY_LABEL.test(fl(c))) { summaryCols.push(c); continue; }
      if (!cur) { cur = { name: cleanSubjectName(fl(c).replace(/\s*(mid\s*-?\s*1|-\s*1)\s*$/i, '')), cols: [] }; groups.push(cur); }
      cur.cols.push(c);
      if (/semester\s*pass|^pass$/i.test(fl(c))) cur = null; // close group
    }
  }
  // drop empty groups
  const subjectGroups = groups.filter((g) => g.cols.length);
  const subjectNames = subjectGroups.map((g) => g.name);

  // classify format (informational)
  const allLabels = subjectGroups.flatMap((g) => g.cols.map((c) => lc(fl(c)))).join('|');
  const format =
    /internal.*external/.test(allLabels) ? 'marks' :
    /cia|ese/.test(allLabels) ? 'cia_ese' :
    /grade\s*point|course\s*point|letter\s*grade/.test(allLabels) ? 'grade_points' :
    /theory|(^|\|)ia(\||$)/.test(allLabels) ? 'theory_ia' :
    /mid|assignment|percentage/.test(allLabels) ? 'mid_based' : 'generic';

  // summary column lookups
  const findSummary = (re: RegExp) => summaryCols.find((c) => re.test(fl(c)) || re.test(gl(c))) ?? -1;
  const cCgpa = findSummary(/c?gpa|tgpa|sgpa/i);
  const cTotalPct = findSummary(/total\s*%|total\s*percentage/i);
  const cFailed = findSummary(/subjects?\s*failed|no\.?\s*of\s*subjects/i);
  const cOverall = findSummary(/overall/i);

  // helper: pick a metric column in a group by label regex
  const pick = (g: Group, re: RegExp) => g.cols.find((c) => re.test(fl(c)));

  const students: ParsedStudent[] = [];
  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r];
    const cell = (c: number) => (c >= 0 && c < row.length ? norm(row[c]) : '');

    // ---- identity ----
    const identity: Record<string, string> = {};
    for (let c = 0; c < subjectStart; c++) {
      const key = fl(c) || gl(c);
      if (key) identity[key] = cell(c);
    }
    const findId = (re: RegExp) => {
      for (let c = 0; c < subjectStart; c++) if (re.test(fl(c) || gl(c)) && cell(c)) return cell(c);
      return null;
    };
    // UID: label → value pattern → reg/roll/admission → any id-ish value
    let uid = '';
    for (let c = 0; c < subjectStart; c++) {
      if (/^(uid|student\s*uid)$/i.test(fl(c) || gl(c)) && cell(c)) { uid = cell(c); break; }
    }
    if (!uid) for (let c = 0; c < subjectStart; c++) { if (isUidValue(cell(c))) { uid = cell(c); break; } }
    if (!uid) uid = findId(/reg|roll|admission/i) ?? '';
    if (!uid) {
      for (let c = 0; c < subjectStart; c++) {
        const v = cell(c), k = fl(c) || gl(c);
        if (v && v.length >= 4 && /\d/.test(v) && !/name/i.test(k)) { uid = v; break; }
      }
    }
    if (!uid) continue; // no identifiable student
    // Skip spreadsheet error values that leaked into the UID cell (#N/A, #REF!, etc.)
    if (/^#(n\/?a|ref|value|name|div\/0|error|null|num)/i.test(uid)) continue;
    const fullName = findId(/name/i);
    const universityId = findId(/univ(ersity)?\.?\s*id/i);
    const bitsId = findId(/bits\s*id/i);

    // ---- subjects ----
    const subjects: ParsedSubject[] = subjectGroups.map((g, i) => {
      const metrics: Record<string, string | number> = {};
      for (const c of g.cols) {
        const rawKey = (fl(c) || `col${c}`).replace(/\s+/g, ' ').trim();
        const raw = cell(c);
        if (raw === '') continue;
        let key = rawKey, k = 2;
        while (key in metrics) key = `${rawKey} (${k++})`; // preserve duplicate columns
        const n = num(raw);
        metrics[key] = n != null && /^-?\d+(\.\d+)?%?$/.test(raw) ? n : raw;
      }
      const cInt = pick(g, /internal/i);
      const cExt = pick(g, /external/i);
      const cTot = pick(g, /total\s*score\s*%|^percentage$|^total\s*%|^total$|^total\s*number$/i);
      const cGrade = pick(g, /(^|\s)grade$|letter\s*grade/i); // "Grade", not "Grade Point"
      const cGp = pick(g, /grade\s*point|course\s*point|points?/i);
      // Some colleges (e.g. ADYPU) put multiple Pass/Fail columns per subject
      // (internal result, then external result). The AUTHORITATIVE one is the last
      // (adjacent to the Total / final score) — matches the college's own counts.
      const passCols = g.cols.filter((c) => /pass|result/i.test(fl(c)));
      const passVals = passCols.map((c) => passFail(cell(c))).filter((v): v is boolean => v !== null);

      // Some colleges store percentages as fractions (0.79 = 79%). Normalize when the label is a %.
      const pctize = (n: number | null, label: string) =>
        (n != null && /%/.test(label) && n > 0 && n <= 1.5) ? Math.round(n * 10000) / 100 : n;
      const internal = pctize(cInt != null ? num(cell(cInt)) : null, cInt != null ? fl(cInt) : '');
      const external = pctize(cExt != null ? num(cell(cExt)) : null, cExt != null ? fl(cExt) : '');
      let total = pctize(cTot != null ? num(cell(cTot)) : null, cTot != null ? fl(cTot) : '');
      const totRaw = cTot != null ? cell(cTot) : '';
      // Only synthesize a total from internal+external when BOTH are clearly percentages
      // (avoids bogus totals where "external" is really a grade-point, e.g. SGU/Svyasa).
      const intIsPct = cInt != null && /%/.test(fl(cInt));
      const extIsPct = cExt != null && /%/.test(fl(cExt));
      // Only SYNTHESIZE a total when the sheet has NO total column at all. If a Total
      // column exists but is blank, grades simply aren't finalized yet (→ in_progress,
      // not a fabricated fail). This is the SGU case.
      if (total == null && cTot == null && internal != null && external != null && intIsPct && extIsPct)
        total = Math.round((internal * 0.4 + external * 0.6) * 100) / 100;
      let grade = cGrade != null && cell(cGrade) ? cell(cGrade) : null;
      // Several colleges put a letter grade in the "Total Score %" column instead of a number.
      if (!grade && total == null && totRaw && num(totRaw) == null) grade = totRaw;
      const gp = cGp != null ? num(cell(cGp)) : null;
      const score = total ?? gp ?? null;

      let passed: boolean | null = passVals.length ? passVals[passVals.length - 1] : null;
      if (passed == null && grade) passed = !/^(f|ra|ab|fail|absent)$/i.test(grade);
      // Derive from total ONLY when there's a real score (>0). A 0/blank with no
      // Pass/Fail and no grade = not graded / non-academic column (e.g. NCC, community
      // service) → leave as null (in progress), never count it as a failed subject.
      if (passed == null && total != null && total > 0) passed = total >= config.passMarkPct;

      const hasAny = Object.keys(metrics).length > 0;
      return { position: i + 1, name: g.name, metrics, internal, external, total, score, grade, passed: hasAny ? passed : null };
    });

    const graded = subjects.filter((s) => Object.keys(s.metrics).length > 0);
    const anyGraded = graded.length > 0;
    const dataComplete = anyGraded && subjects.every((s) => Object.keys(s.metrics).length > 0);

    let cgpa = cCgpa >= 0 ? num(cell(cCgpa)) : null;
    let subjectsFailed: number | null;
    let overall: ParsedStudent['overall'];
    const determinable = subjects.filter((s) => s.passed !== null);
    if (!anyGraded || determinable.length === 0) {
      // No graded subjects (empty cells) → results not entered yet → in progress.
      overall = 'in_progress'; subjectsFailed = null;
    } else {
      // TRUTH = the actual subject results. 0 failed subjects = PASS.
      // The sheet's "Overall Pass/Fail", "No. of subjects failed" and "Total CGPA"
      // summary columns are frequently stale/blank (e.g. CGPA 0 + Overall Fail while
      // every subject shows PASS), so we DERIVE from subjects and ignore them.
      subjectsFailed = determinable.filter((s) => s.passed === false).length;
      overall = subjectsFailed === 0 ? 'pass' : 'fail';
    }
    // A passing student with CGPA exactly 0 = CGPA not computed in the sheet yet → blank, not "0.00".
    if (cgpa === 0 && overall === 'pass') cgpa = null;

    // Only genuine data-quality flag left: the UID column holding a name.
    const suspiciousUid = /\s/.test(uid) && !/\d/.test(uid);
    const flagged = suspiciousUid;
    const flagReason = suspiciousUid ? 'UID column holds a name — verify source sheet' : null;

    const raw: Record<string, string> = {};
    for (let c = 0; c < width; c++) { const k = fl(c) || gl(c); if (k) raw[k] = cell(c); }

    students.push({
      uid, fullName, universityId, bitsId, identity, subjects,
      cgpa, totalPct: cTotalPct >= 0 ? num(cell(cTotalPct)) : null,
      subjectsFailed, overall, dataComplete,
      flagged, flagReason, raw,
    });
  }

  return { format, subjectNames, students, warnings };
}
