const STORAGE_KEY = "bdSpecGenerator.specs.v2";
const LEGACY_STORAGE_KEY = "bdSpecGenerator.specs.v1";
const API_KEY_KEY = "bdSpecGenerator.openaiApiKey";

const STATUS = {
  DRAFT: "Draft",
  SENT: "Sent",
  FOLLOWUP1_DUE: "Follow-up 1 due",
  FOLLOWUP1_SENT: "Follow-up 1 sent",
  FOLLOWUP2_DUE: "Follow-up 2 due",
  FOLLOWUP2_SENT: "Follow-up 2 sent",
  FINAL_DUE: "Final follow-up due",
  CLOSED: "Closed",
  REPLIED: "Replied",
};

const STATUS_OPTIONS = Object.values(STATUS);
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const defaults = {
  moduleFocus: "SAP FI/CO",
  targetCountry: "France",
  availability: "Immediate",
  location: "France (flexible across EU projects)",
};

const state = {
  specs: loadSpecs(),
  selectedFile: null,
  selectedFilename: "",
  filters: { company: "", manager: "", module: "", status: "", dueTodayOnly: false },
};

const els = {
  apiKey: document.getElementById("apiKey"),
  screenshot: document.getElementById("screenshot"),
  dropZone: document.getElementById("dropZone"),
  screenshotPreview: document.getElementById("screenshotPreview"),
  screenshotFilename: document.getElementById("screenshotFilename"),
  screenshotError: document.getElementById("screenshotError"),
  moduleFocus: document.getElementById("moduleFocus"),
  targetCountry: document.getElementById("targetCountry"),
  candidateType: document.getElementById("candidateType"),
  marketContext: document.getElementById("marketContext"),
  managerName: document.getElementById("managerName"),
  companyName: document.getElementById("companyName"),
  roleTitle: document.getElementById("roleTitle"),
  emailAddress: document.getElementById("emailAddress"),
  detectedContext: document.getElementById("detectedContext"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  generateBtn: document.getElementById("generateBtn"),
  analysisMessage: document.getElementById("analysisMessage"),
  specList: document.getElementById("specList"),
  exportBtn: document.getElementById("exportBtn"),
  exportBackupBtn: document.getElementById("exportBackupBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  clearBtn: document.getElementById("clearBtn"),
  dueToday: document.getElementById("dueToday"),
  overdueFollowups: document.getElementById("overdueFollowups"),
  dashboard: document.getElementById("dashboard"),
  filterCompany: document.getElementById("filterCompany"),
  filterManager: document.getElementById("filterManager"),
  filterModule: document.getElementById("filterModule"),
  filterStatus: document.getElementById("filterStatus"),
  filterDueToday: document.getElementById("filterDueToday"),
};

init();

function init() {
  els.apiKey.value = localStorage.getItem(API_KEY_KEY) || "";
  els.apiKey.addEventListener("change", () => localStorage.setItem(API_KEY_KEY, els.apiKey.value.trim()));

  els.dropZone.addEventListener("click", () => els.screenshot.click());
  els.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      els.screenshot.click();
    }
  });
  els.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
  els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragging"));
  els.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
    const [file] = event.dataTransfer.files || [];
    setScreenshotFile(file);
  });
  els.screenshot.addEventListener("change", () => {
    const [file] = els.screenshot.files || [];
    setScreenshotFile(file);
  });

  els.analyzeBtn.addEventListener("click", analyzeScreenshot);
  els.generateBtn.addEventListener("click", generateSpec);
  els.exportBtn.addEventListener("click", exportCsv);
  els.exportBackupBtn.addEventListener("click", exportJsonBackup);
  els.importBtn.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", importBackup);
  els.clearBtn.addEventListener("click", clearDay);

  els.filterCompany.addEventListener("input", () => updateFilters("company", els.filterCompany.value));
  els.filterManager.addEventListener("input", () => updateFilters("manager", els.filterManager.value));
  els.filterModule.addEventListener("input", () => updateFilters("module", els.filterModule.value));
  els.filterStatus.addEventListener("change", () => updateFilters("status", els.filterStatus.value));
  els.filterDueToday.addEventListener("change", () => updateFilters("dueTodayOnly", els.filterDueToday.checked));

  renderStatusFilter();
  normalizeAllStatuses();
  persistSpecs();
  render();
}

function renderStatusFilter() {
  els.filterStatus.innerHTML = `<option value="">All statuses</option>${STATUS_OPTIONS.map((status) => `<option value="${status}">${status}</option>`).join("")}`;
}

function setScreenshotFile(file) {
  clearScreenshotError();
  if (!file) return;
  if (!IMAGE_TYPES.includes(file.type)) {
    state.selectedFile = null;
    state.selectedFilename = "";
    els.screenshot.value = "";
    setScreenshotError("Please upload a PNG, JPG, JPEG, or WEBP image.");
    renderDropZoneState();
    return;
  }

  state.selectedFile = file;
  state.selectedFilename = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    els.screenshotPreview.src = reader.result;
    renderDropZoneState();
  };
  reader.readAsDataURL(file);
}

function renderDropZoneState() {
  const hasFile = !!state.selectedFile;
  els.screenshotFilename.textContent = hasFile ? `Selected: ${state.selectedFilename}` : "";
  els.screenshotPreview.classList.toggle("hidden", !hasFile);
  els.dropZone.classList.toggle("selected", hasFile);
}

function setScreenshotError(message) {
  els.screenshotError.textContent = message;
  els.screenshotError.classList.remove("hidden");
  els.dropZone.classList.add("error-state");
}

function clearScreenshotError() {
  els.screenshotError.textContent = "";
  els.screenshotError.classList.add("hidden");
  els.dropZone.classList.remove("error-state");
}

async function analyzeScreenshot() {
  const file = state.selectedFile;
  const apiKey = getApiKey();

  if (!file) return setMessage("Please upload a screenshot first.");
  if (!apiKey) return setMessage("Please add your OpenAI API key.");

  setMessage("Analyzing screenshot...");
  const base64Image = await fileToBase64(file);

  const prompt = `Extract visible information from this uploaded LinkedIn screenshot ONLY. Do not infer unknown facts.
Return strict JSON with keys:
manager_name, company_name, role_title, sap_hiring_context, confidence_notes.
Use empty strings for missing fields.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:${file.type};base64,${base64Image}` }] }],
        text: {
          format: {
            type: "json_schema",
            name: "linkedin_extract",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                manager_name: { type: "string" },
                company_name: { type: "string" },
                role_title: { type: "string" },
                sap_hiring_context: { type: "string" },
                confidence_notes: { type: "string" },
              },
              required: ["manager_name", "company_name", "role_title", "sap_hiring_context", "confidence_notes"],
            },
          },
        },
      }),
    });

    if (!response.ok) throw new Error(await response.text());

    const payload = await response.json();
    const extracted = JSON.parse(payload.output_text);

    els.managerName.value = extracted.manager_name || "";
    els.companyName.value = extracted.company_name || "";
    els.roleTitle.value = extracted.role_title || "";
    els.detectedContext.value = extracted.sap_hiring_context || "";

    let msg = "Analysis complete.";
    if (!extracted.manager_name || !extracted.company_name) msg += " Name or company was unclear. Please fill missing fields manually.";
    if (extracted.confidence_notes) msg += ` ${extracted.confidence_notes}`;
    setMessage(msg);
  } catch (error) {
    console.error(error);
    setMessage("Could not analyze screenshot. Check API key and image quality.");
  }
}

function generateSpec() {
  const managerName = clean(els.managerName.value);
  const companyName = clean(els.companyName.value);
  if (!managerName || !companyName) return setMessage("Please fill manager name and company name manually if not detected.");

  const moduleFocus = clean(els.moduleFocus.value) || defaults.moduleFocus;
  const targetCountry = clean(els.targetCountry.value) || defaults.targetCountry;
  const candidateType = clean(els.candidateType.value) || `${moduleFocus} Consultant`;
  const marketContext = clean(els.marketContext.value) || "S/4HANA programme";
  const roleTitle = clean(els.roleTitle.value);
  const emailAddress = clean(els.emailAddress.value);
  const detectedContext = clean(els.detectedContext.value);
  const screenshotFilename = state.selectedFilename || "";

  const subject = `${moduleFocus} Consultant – S/4HANA Finance (Available ${defaults.availability})`;
  const introContext = detectedContext || marketContext;
  const roleHint = roleTitle ? ` in your role as ${roleTitle}` : "";

  const mainEmail = `Hi ${managerName},

Please excuse the direct approach. While supporting another manufacturing client currently delivering an ${marketContext} in ${targetCountry}, I understand that ${companyName} are continuing to strengthen their SAP Finance capabilities, particularly across ${moduleFocus} within S/4 environments${roleHint}.

I wanted to share a consultant who has recently become available and could be relevant depending on your current or upcoming initiatives.

Availability – ${defaults.availability}
Location – ${defaults.location}

- 10+ years' ${moduleFocus} experience, with 5+ years specifically on S/4HANA Finance programmes
- Strong delivery across multiple S/4HANA implementations (greenfield and brownfield), including Central Finance and Group Reporting
- Deep expertise across GL, AP/AR, Asset Accounting, and COPA, with strong integration into SD/MM
- Experience working within SI-led programmes (Capgemini, Deloitte) on large-scale European rollouts
- Proven track record supporting finance transformation projects in manufacturing environments, including blueprinting, testing, and post go-live support

He is available immediately and would be able to interview this week (Mon–Fri, 09:00–15:00 CET).

Would it make sense to share the full profile?

Best regards,
Joe`;

  const followUp1 = `Hi ${managerName},

Just wanted to follow up on the SAP ${moduleFocus} profile I shared earlier this week.

Is this not the type of consultant you are currently looking for, or is it simply a matter of timing?

Either way, it would be helpful for me to understand so I can keep future outreach relevant.

Best regards,
Joe`;

  const followUp2 = `Hi ${managerName},

Just checking whether this SAP ${moduleFocus} profile could be relevant for any current or upcoming S/4HANA work at ${companyName}.

If not, no problem — I’d appreciate knowing so I can avoid sending anything that’s not aligned.

Best regards,
Joe`;

  const finalFollowUp = `Hi ${managerName},

As I haven’t heard back, should I assume this profile isn’t relevant at the moment?

Best regards,
Joe`;

  const now = new Date();
  const spec = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    dateCreated: isoDate(now),
    dateSent: "",
    managerName,
    companyName,
    roleTitle,
    screenshotFilename,
    emailAddress,
    moduleFocus,
    detectedContext,
    targetCountry,
    candidateType,
    marketContext: introContext,
    subject,
    mainEmail,
    followUp1,
    followUp2,
    finalFollowUp,
    followUp1SentDate: "",
    followUp2SentDate: "",
    finalFollowUpSentDate: "",
    closedAt: "",
    repliedAt: "",
    status: STATUS.DRAFT,
  };

  state.specs.unshift(spec);
  persistSpecs();
  render();
  setMessage("Spec generated and saved to Tracker.");
}

function render() {
  normalizeAllStatuses();
  renderDashboard();
  renderDueToday();
  renderOverdue();

  const specs = getFilteredSpecs();
  if (!specs.length) {
    els.specList.innerHTML = `<p class="empty">No matching specs.</p>`;
    return;
  }

  els.specList.innerHTML = specs.map((spec) => {
    const dueInfo = getDueInfo(spec);
    return `<article class="spec-item">
      <div class="spec-head"><strong>${escapeHtml(spec.managerName)} @ ${escapeHtml(spec.companyName)}</strong><span class="badge">${escapeHtml(spec.status)}</span></div>
      <p class="hint">Created: ${spec.dateCreated || isoDate(new Date(spec.createdAt))}${spec.dateSent ? ` | Sent: ${spec.dateSent}` : ""}${dueInfo ? ` | ${dueInfo}` : ""}</p>
      <p class="hint">Role: ${escapeHtml(spec.roleTitle || "-")} | Email: ${escapeHtml(spec.emailAddress || "-")} | Module: ${escapeHtml(spec.moduleFocus)}</p>
      <p class="hint">Screenshot: ${escapeHtml(spec.screenshotFilename || "-")}</p>

      ${renderOutput("Main Spec Email", spec.mainEmail, spec.id, "main")}
      ${renderOutput("Follow-up 1", spec.followUp1, spec.id, "f1")}
      ${renderOutput("Follow-up 2", spec.followUp2, spec.id, "f2")}
      ${renderOutput("Final Follow-up", spec.finalFollowUp, spec.id, "f3")}

      <div class="actions wrap">
        ${!spec.dateSent ? `<button onclick="markSent('${spec.id}')">Mark as Sent</button>` : ""}
        ${canSendFollowUp1(spec) ? `<button onclick="markFollowUpSent('${spec.id}',1)">Mark Follow-up 1 Sent</button>` : ""}
        ${canSendFollowUp2(spec) ? `<button onclick="markFollowUpSent('${spec.id}',2)">Mark Follow-up 2 Sent</button>` : ""}
        ${canSendFinalFollowUp(spec) ? `<button onclick="markFollowUpSent('${spec.id}',3)">Mark Final Follow-up Sent</button>` : ""}
        ${spec.status !== STATUS.REPLIED ? `<button onclick="markReplied('${spec.id}')">Mark as Replied</button>` : ""}
        ${spec.status !== STATUS.CLOSED ? `<button onclick="markClosed('${spec.id}')">Close</button>` : ""}
      </div>
    </article>`;
  }).join("");
}

function renderDashboard() {
  const today = isoDate(new Date());
  const metrics = [
    ["Specs created today", state.specs.filter((s) => s.dateCreated === today).length],
    ["Specs sent today", state.specs.filter((s) => s.dateSent === today).length],
    ["Follow-ups due today", dueTodaySpecs().length],
    ["Overdue follow-ups", overdueSpecs().length],
    ["Replies logged", state.specs.filter((s) => s.status === STATUS.REPLIED).length],
    ["Open specs", state.specs.filter((s) => ![STATUS.REPLIED, STATUS.CLOSED].includes(s.status)).length],
  ];

  els.dashboard.innerHTML = metrics.map(([label, value]) => `<div class="metric"><div class="metric-value">${value}</div><div class="hint">${label}</div></div>`).join("");
}

function renderDueToday() {
  const due = dueTodaySpecs();
  if (!due.length) return (els.dueToday.innerHTML = "No follow-ups due today.");

  els.dueToday.innerHTML = due.map((spec) => {
    const dueType = getDueType(spec);
    const key = dueType === 1 ? "f1" : dueType === 2 ? "f2" : "f3";
    const label = dueType === 1 ? "Follow-up 1" : dueType === 2 ? "Follow-up 2" : "Final follow-up";
    return `<div class="due-item"><strong>${escapeHtml(spec.managerName)}</strong> @ ${escapeHtml(spec.companyName)}<br/>Module: ${escapeHtml(spec.moduleFocus)}<br/>Due: ${label}
      <div class="actions"><button onclick="copyField('${spec.id}','${key}')">Copy ${label} Email</button><button onclick="markFollowUpSent('${spec.id}',${dueType})">Mark as Sent</button></div></div>`;
  }).join("");
}

function renderOverdue() {
  const overdue = overdueSpecs();
  if (!overdue.length) return (els.overdueFollowups.innerHTML = "No overdue follow-ups.");

  els.overdueFollowups.innerHTML = overdue.map((spec) => {
    const dueType = getDueType(spec);
    const label = dueType === 1 ? "Follow-up 1" : dueType === 2 ? "Follow-up 2" : "Final follow-up";
    const dueDate = dueType === 1 ? getDueDate(spec, 2) : dueType === 2 ? getDueDate(spec, 5) : getDueDate(spec, 9);
    return `<div class="due-item overdue"><strong>${escapeHtml(spec.managerName)}</strong> @ ${escapeHtml(spec.companyName)}<br/>${label} overdue since ${dueDate}</div>`;
  }).join("");
}

function markSent(id) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec) return;
  const now = isoDate(new Date());
  spec.dateSent = now;
  spec.status = STATUS.SENT;
  persistSpecs();
  render();
}

function markFollowUpSent(id, step) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec || !spec.dateSent) return;
  const now = isoDate(new Date());
  if (step === 1) {
    spec.followUp1SentDate = now;
    spec.status = STATUS.FOLLOWUP1_SENT;
  }
  if (step === 2) {
    spec.followUp2SentDate = now;
    spec.status = STATUS.FOLLOWUP2_SENT;
  }
  if (step === 3) {
    spec.finalFollowUpSentDate = now;
    spec.status = STATUS.CLOSED;
  }
  persistSpecs();
  render();
}

function markReplied(id) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec) return;
  spec.repliedAt = isoDate(new Date());
  spec.status = STATUS.REPLIED;
  persistSpecs();
  render();
}

function markClosed(id) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec) return;
  spec.closedAt = isoDate(new Date());
  spec.status = STATUS.CLOSED;
  persistSpecs();
  render();
}

function canSendFollowUp1(spec) { return !!spec.dateSent && !spec.followUp1SentDate && !isClosedOrReplied(spec); }
function canSendFollowUp2(spec) { return !!spec.dateSent && !!spec.followUp1SentDate && !spec.followUp2SentDate && !isClosedOrReplied(spec); }
function canSendFinalFollowUp(spec) { return !!spec.dateSent && !!spec.followUp2SentDate && !spec.finalFollowUpSentDate && !isClosedOrReplied(spec); }

function isClosedOrReplied(spec) {
  return [STATUS.CLOSED, STATUS.REPLIED].includes(spec.status);
}

function getDueDate(spec, daysAfterSent) {
  const d = new Date(spec.dateSent);
  d.setDate(d.getDate() + daysAfterSent);
  return isoDate(d);
}

function getDueType(spec) {
  if (!spec.dateSent || isClosedOrReplied(spec)) return 0;
  const today = isoDate(new Date());
  const f1Due = getDueDate(spec, 2);
  const f2Due = getDueDate(spec, 5);
  const f3Due = getDueDate(spec, 9);

  if (!spec.followUp1SentDate && today >= f1Due) return 1;
  if (spec.followUp1SentDate && !spec.followUp2SentDate && today >= f2Due) return 2;
  if (spec.followUp2SentDate && !spec.finalFollowUpSentDate && today >= f3Due) return 3;
  return 0;
}

function getDueInfo(spec) {
  if (!spec.dateSent || isClosedOrReplied(spec)) return "";
  if (!spec.followUp1SentDate) return `Follow-up 1 due: ${getDueDate(spec, 2)}`;
  if (!spec.followUp2SentDate) return `Follow-up 2 due: ${getDueDate(spec, 5)}`;
  if (!spec.finalFollowUpSentDate) return `Final follow-up due: ${getDueDate(spec, 9)}`;
  return "";
}

function dueTodaySpecs() {
  const today = isoDate(new Date());
  return state.specs.filter((s) => {
    const dueType = getDueType(s);
    if (!dueType) return false;
    const dueDate = dueType === 1 ? getDueDate(s, 2) : dueType === 2 ? getDueDate(s, 5) : getDueDate(s, 9);
    return dueDate === today;
  });
}

function overdueSpecs() {
  const today = isoDate(new Date());
  return state.specs.filter((s) => {
    const dueType = getDueType(s);
    if (!dueType) return false;
    const dueDate = dueType === 1 ? getDueDate(s, 2) : dueType === 2 ? getDueDate(s, 5) : getDueDate(s, 9);
    return dueDate < today;
  });
}

function updateFilters(key, value) {
  state.filters[key] = value;
  render();
}

function getFilteredSpecs() {
  return state.specs.filter((s) => {
    const byCompany = s.companyName.toLowerCase().includes(state.filters.company.toLowerCase());
    const byManager = s.managerName.toLowerCase().includes(state.filters.manager.toLowerCase());
    const byModule = s.moduleFocus.toLowerCase().includes(state.filters.module.toLowerCase());
    const byStatus = !state.filters.status || s.status === state.filters.status;
    const byDueToday = !state.filters.dueTodayOnly || dueTodaySpecs().some((d) => d.id === s.id);
    return byCompany && byManager && byModule && byStatus && byDueToday;
  });
}

function renderOutput(title, text, id, key) {
  return `<div class="output-block"><p class="output-title">${title}</p><div class="output-text">${escapeHtml(text)}</div><div class="copy-row"><button onclick="copyField('${id}','${key}')">Copy ${title}</button></div></div>`;
}

function copyField(id, key) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec) return;
  const map = { main: spec.mainEmail, f1: spec.followUp1, f2: spec.followUp2, f3: spec.finalFollowUp };
  navigator.clipboard.writeText(map[key] || "").then(() => setMessage("Copied."));
}

function exportCsv() {
  if (!state.specs.length) return setMessage("No specs to export.");
  const rows = [["id","manager_name","company","role_title","linkedin_screenshot_filename","email_address","module_focus","main_spec_email","follow_up_1","follow_up_2","final_follow_up","date_created","date_sent","status","follow_up_1_sent_date","follow_up_2_sent_date","final_follow_up_sent_date","replied_at","closed_at"]
    , ...state.specs.map((s) => [s.id,s.managerName,s.companyName,s.roleTitle,s.screenshotFilename,s.emailAddress,s.moduleFocus,s.mainEmail,s.followUp1,s.followUp2,s.finalFollowUp,s.dateCreated,s.dateSent,s.status,s.followUp1SentDate,s.followUp2SentDate,s.finalFollowUpSentDate,s.repliedAt,s.closedAt])];
  downloadFile(rows.map((r) => r.map(csvCell).join(",")).join("\n"), `bd-tracker-${isoDate(new Date())}.csv`, "text/csv;charset=utf-8;");
}

function exportJsonBackup() {
  downloadFile(JSON.stringify(state.specs, null, 2), `bd-tracker-backup-${isoDate(new Date())}.json`, "application/json;charset=utf-8;");
}

async function importBackup(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  const text = await file.text();
  try {
    let imported = [];
    if (file.name.toLowerCase().endsWith(".json")) imported = JSON.parse(text);
    else imported = parseCsv(text);
    if (!Array.isArray(imported)) throw new Error("Invalid file format");

    const normalized = imported.map(normalizeSpec).filter(Boolean);
    if (!normalized.length) throw new Error("No valid records found");

    state.specs = normalized.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    persistSpecs();
    render();
    setMessage(`Imported ${normalized.length} records.`);
  } catch {
    setMessage("Import failed. Use a valid CSV or JSON backup file.");
  } finally {
    els.importFile.value = "";
  }
}

function clearDay() {
  if (!confirm("This will permanently clear all tracker records for this browser. Continue?")) return;
  state.specs = [];
  persistSpecs();
  render();
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase());
  return lines.map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ""; });
    return row;
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current);
      current = "";
    } else current += char;
  }
  result.push(current);
  return result;
}

function normalizeSpec(raw) {
  const spec = {
    id: raw.id || crypto.randomUUID(),
    createdAt: raw.createdAt || raw.created_at || (raw.dateCreated ? new Date(raw.dateCreated).toISOString() : new Date().toISOString()),
    dateCreated: raw.dateCreated || raw.date_created || raw.created_at?.slice(0, 10) || isoDate(new Date()),
    dateSent: raw.dateSent || raw.date_sent || raw.sent_date || "",
    managerName: raw.managerName || raw.manager_name || "",
    companyName: raw.companyName || raw.company || raw.company_name || "",
    roleTitle: raw.roleTitle || raw.role_title || "",
    screenshotFilename: raw.screenshotFilename || raw.linkedin_screenshot_filename || "",
    emailAddress: raw.emailAddress || raw.email_address || "",
    moduleFocus: raw.moduleFocus || raw.module_focus || defaults.moduleFocus,
    detectedContext: raw.detectedContext || raw.detected_context || "",
    targetCountry: raw.targetCountry || raw.target_country || defaults.targetCountry,
    candidateType: raw.candidateType || raw.candidate_type || "",
    marketContext: raw.marketContext || raw.market_context || "",
    subject: raw.subject || "",
    mainEmail: raw.mainEmail || raw.main_spec_email || raw.main_email || "",
    followUp1: raw.followUp1 || raw.follow_up_1 || "",
    followUp2: raw.followUp2 || raw.follow_up_2 || "",
    finalFollowUp: raw.finalFollowUp || raw.final_follow_up || "",
    followUp1SentDate: raw.followUp1SentDate || raw.follow_up_1_sent_date || "",
    followUp2SentDate: raw.followUp2SentDate || raw.follow_up_2_sent_date || "",
    finalFollowUpSentDate: raw.finalFollowUpSentDate || raw.final_follow_up_sent_date || "",
    repliedAt: raw.repliedAt || raw.replied_at || "",
    closedAt: raw.closedAt || raw.closed_at || "",
    status: raw.status || STATUS.DRAFT,
  };

  if (!spec.managerName || !spec.companyName) return null;
  normalizeStatus(spec);
  return spec;
}

function normalizeAllStatuses() {
  state.specs = state.specs.map((s) => normalizeSpec(s)).filter(Boolean);
}

function normalizeStatus(spec) {
  if (spec.status === STATUS.REPLIED || spec.status === STATUS.CLOSED) return;
  if (!spec.dateSent) {
    spec.status = STATUS.DRAFT;
    return;
  }
  if (spec.finalFollowUpSentDate) {
    spec.status = STATUS.CLOSED;
    return;
  }
  if (spec.followUp2SentDate) {
    spec.status = isDateDue(getDueDate(spec, 9)) ? STATUS.FINAL_DUE : STATUS.FOLLOWUP2_SENT;
    return;
  }
  if (spec.followUp1SentDate) {
    spec.status = isDateDue(getDueDate(spec, 5)) ? STATUS.FOLLOWUP2_DUE : STATUS.FOLLOWUP1_SENT;
    return;
  }
  spec.status = isDateDue(getDueDate(spec, 2)) ? STATUS.FOLLOWUP1_DUE : STATUS.SENT;
}

function isDateDue(date) {
  return date <= isoDate(new Date());
}

function loadSpecs() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeSpec).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function persistSpecs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.specs));
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getApiKey() {
  const key = els.apiKey.value.trim();
  if (key) localStorage.setItem(API_KEY_KEY, key);
  return key;
}

function setMessage(msg) { els.analysisMessage.textContent = msg; }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

function csvCell(val) { return `"${String(val ?? "").replaceAll('"', '""')}"`; }

function clean(v) { return (v || "").trim(); }

function escapeHtml(text) {
  return String(text || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

window.markSent = markSent;
window.markFollowUpSent = markFollowUpSent;
window.markReplied = markReplied;
window.markClosed = markClosed;
window.copyField = copyField;
