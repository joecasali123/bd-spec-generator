const STORAGE_KEY = "bdSpecGenerator.specs.v2";
const LEGACY_STORAGE_KEY = "bdSpecGenerator.specs.v1";
const API_KEY_KEY = "bdSpecGenerator.openaiApiKey";

const STATUS = {
  DRAFT: "Draft",
  SENT: "Sent",
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const FOLLOW_UP_OFFSETS = [2, 5, 9];

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
  todaysActions: document.getElementById("todaysActions"),
  draftList: document.getElementById("draftList"),
  sentList: document.getElementById("sentList"),
  exportBtn: document.getElementById("exportBtn"),
  exportBackupBtn: document.getElementById("exportBackupBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  clearBtn: document.getElementById("clearBtn"),
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

  normalizeAllStatuses();
  persistSpecs();
  render();
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

  const prompt = "Extract manager name, company, role, and SAP context from this LinkedIn screenshot.";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: `data:${file.type || "image/png"};base64,${base64Image}` },
            ],
          },
        ],
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

    const rawBody = await response.text();
    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      throw new Error(rawBody || "OpenAI returned a non-JSON response.");
    }

    if (!response.ok) {
      const apiError = payload?.error?.message || payload?.message || rawBody || "OpenAI request failed.";
      throw new Error(apiError);
    }

    const outputText = payload?.output_text || payload?.output?.[0]?.content?.find((item) => item.type === "output_text")?.text;
    if (!outputText) throw new Error("OpenAI response did not include output_text.");

    const extracted = JSON.parse(outputText);

    els.managerName.value = extracted.manager_name || "";
    els.companyName.value = extracted.company_name || "";
    els.roleTitle.value = extracted.role_title || "";
    els.detectedContext.value = extracted.sap_hiring_context || "";

    let msg = "Analysis complete.";
    if (!extracted.manager_name || !extracted.company_name) msg += " Name or company was unclear. Please fill missing fields manually.";
    if (extracted.confidence_notes) msg += ` ${extracted.confidence_notes}`;
    setMessage(msg);
  } catch (error) {
    setMessage(`Could not analyze screenshot: ${error?.message || "Unknown error."}`);
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

  const mainEmail = `Hi ${managerName},\n\nPlease excuse the direct approach. While supporting another manufacturing client currently delivering an ${marketContext} in ${targetCountry}, I understand that ${companyName} are continuing to strengthen their SAP Finance capabilities, particularly across ${moduleFocus} within S/4 environments${roleHint}.\n\nI wanted to share a consultant who has recently become available and could be relevant depending on your current or upcoming initiatives.\n\nAvailability – ${defaults.availability}\nLocation – ${defaults.location}\n\n- 10+ years' ${moduleFocus} experience, with 5+ years specifically on S/4HANA Finance programmes\n- Strong delivery across multiple S/4HANA implementations (greenfield and brownfield), including Central Finance and Group Reporting\n- Deep expertise across GL, AP/AR, Asset Accounting, and COPA, with strong integration into SD/MM\n- Experience working within SI-led programmes (Capgemini, Deloitte) on large-scale European rollouts\n- Proven track record supporting finance transformation projects in manufacturing environments, including blueprinting, testing, and post go-live support\n\nHe is available immediately and would be able to interview this week (Mon–Fri, 09:00–15:00 CET).\n\nWould it make sense to share the full profile?\n\nBest regards,\nJoe`;

  const followUp1 = `Hi ${managerName},\n\nJust wanted to follow up on the SAP ${moduleFocus} profile I shared earlier this week.\n\nIs this not the type of consultant you are currently looking for, or is it simply a matter of timing?\n\nEither way, it would be helpful for me to understand so I can keep future outreach relevant.\n\nBest regards,\nJoe`;

  const followUp2 = `Hi ${managerName},\n\nJust checking whether this SAP ${moduleFocus} profile could be relevant for any current or upcoming S/4HANA work at ${companyName}.\n\nIf not, no problem — I’d appreciate knowing so I can avoid sending anything that’s not aligned.\n\nBest regards,\nJoe`;

  const finalFollowUp = `Hi ${managerName},\n\nAs I haven’t heard back, should I assume this profile isn’t relevant at the moment?\n\nBest regards,\nJoe`;

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
    followUpSchedule: null,
    status: STATUS.DRAFT,
  };

  state.specs.unshift(spec);
  persistSpecs();
  render();
  setMessage("Spec generated and saved as Draft.");
}

function render() {
  normalizeAllStatuses();
  renderTodaysActions();
  renderDrafts();
  renderSentSpecs();
}

function renderTodaysActions() {
  const actions = getActionableFollowUps();
  if (!actions.length) {
    els.todaysActions.innerHTML = `<p class="empty">No follow-ups due today or overdue.</p>`;
    return;
  }

  els.todaysActions.innerHTML = actions.map(({ spec, step, dueDate, overdue }) => {
    const key = step === 1 ? "f1" : step === 2 ? "f2" : "f3";
    return `<article class="task-item ${overdue ? "overdue" : ""}">
      <div>
        <div class="task-title">${escapeHtml(spec.managerName)} @ ${escapeHtml(spec.companyName)}</div>
        <p class="hint">${followUpLabel(step)} due ${escapeHtml(dueDate)} ${overdue ? "(Overdue)" : "(Today)"}</p>
      </div>
      <div class="actions wrap">
        <button onclick="copyField('${spec.id}','${key}')">Copy</button>
        <button class="primary" onclick="markFollowUpSent('${spec.id}',${step})">Mark as sent</button>
      </div>
    </article>`;
  }).join("");
}

function renderDrafts() {
  const drafts = state.specs.filter((spec) => !spec.dateSent);
  if (!drafts.length) {
    els.draftList.innerHTML = `<p class="empty">No drafts waiting to send.</p>`;
    return;
  }

  els.draftList.innerHTML = drafts.map((spec) => `<article class="spec-item">
      <div class="spec-head"><strong>${escapeHtml(spec.managerName)}</strong><span class="badge">${escapeHtml(spec.moduleFocus)}</span></div>
      <p class="hint">${escapeHtml(spec.companyName)}</p>
      <div class="output-block">
        <p class="output-title">Email Preview</p>
        <div class="output-text preview-text">${escapeHtml(spec.mainEmail.slice(0, 260))}${spec.mainEmail.length > 260 ? "..." : ""}</div>
      </div>
      <div class="actions wrap">
        <button onclick="copyField('${spec.id}','main')">Copy Email</button>
        <button class="primary" onclick="markSent('${spec.id}')">Mark as Sent</button>
      </div>
    </article>`).join("");
}

function renderSentSpecs() {
  const sent = state.specs.filter((spec) => !!spec.dateSent);
  if (!sent.length) {
    els.sentList.innerHTML = `<p class="empty">No sent specs yet.</p>`;
    return;
  }

  els.sentList.innerHTML = sent.map((spec) => {
    const next = getNextFollowUp(spec);
    const nextDate = next ? getDueDate(spec, FOLLOW_UP_OFFSETS[next - 1]) : "-";
    return `<article class="spec-item">
      <div class="spec-head"><strong>${escapeHtml(spec.managerName)} @ ${escapeHtml(spec.companyName)}</strong><span class="badge">${escapeHtml(getSpecStatusText(spec))}</span></div>
      <p class="hint">Sent date: ${escapeHtml(spec.dateSent)} | Next follow-up date: ${escapeHtml(nextDate)}</p>
      <div class="actions wrap">
        <button onclick="copyField('${spec.id}','main')">Copy Original Email</button>
      </div>
    </article>`;
  }).join("");
}

function markSent(id) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec) return;
  const now = isoDate(new Date());
  spec.dateSent = now;
  spec.followUpSchedule = {
    followUp1Due: getDueDate({ dateSent: now }, 2),
    followUp2Due: getDueDate({ dateSent: now }, 5),
    followUp3Due: getDueDate({ dateSent: now }, 9),
  };
  spec.status = STATUS.SENT;
  persistSpecs();
  render();
}

function markFollowUpSent(id, step) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec || !spec.dateSent) return;
  const now = isoDate(new Date());
  if (step === 1) spec.followUp1SentDate = now;
  if (step === 2) spec.followUp2SentDate = now;
  if (step === 3) spec.finalFollowUpSentDate = now;
  spec.status = STATUS.SENT;
  persistSpecs();
  render();
}

function getNextFollowUp(spec) {
  if (!spec.dateSent) return 0;
  if (!spec.followUp1SentDate) return 1;
  if (!spec.followUp2SentDate) return 2;
  if (!spec.finalFollowUpSentDate) return 3;
  return 0;
}

function getActionableFollowUps() {
  const today = isoDate(new Date());
  return state.specs
    .map((spec) => {
      const step = getNextFollowUp(spec);
      if (!step) return null;
      const dueDate = getDueDate(spec, FOLLOW_UP_OFFSETS[step - 1]);
      if (dueDate > today) return null;
      return { spec, step, dueDate, overdue: dueDate < today };
    })
    .filter(Boolean)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function followUpLabel(step) {
  if (step === 1) return "Follow-up +2d";
  if (step === 2) return "Follow-up +5d";
  return "Follow-up +9d";
}

function getSpecStatusText(spec) {
  const step = getNextFollowUp(spec);
  if (!step) return "All follow-ups sent";
  const dueDate = getDueDate(spec, FOLLOW_UP_OFFSETS[step - 1]);
  const today = isoDate(new Date());
  if (dueDate < today) return `${followUpLabel(step)} overdue`;
  if (dueDate === today) return `${followUpLabel(step)} due today`;
  return `Waiting for ${followUpLabel(step)}`;
}

function getDueDate(spec, daysAfterSent) {
  const d = new Date(spec.dateSent);
  d.setDate(d.getDate() + daysAfterSent);
  return isoDate(d);
}

function copyField(id, key) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec) return;
  const map = { main: spec.mainEmail, f1: spec.followUp1, f2: spec.followUp2, f3: spec.finalFollowUp };
  navigator.clipboard.writeText(map[key] || "").then(() => setMessage("Copied."));
}

function exportCsv() {
  if (!state.specs.length) return setMessage("No specs to export.");
  const rows = [["id","manager_name","company","role_title","linkedin_screenshot_filename","email_address","module_focus","main_spec_email","follow_up_1","follow_up_2","final_follow_up","date_created","date_sent","status","follow_up_1_sent_date","follow_up_2_sent_date","final_follow_up_sent_date"]
    , ...state.specs.map((s) => [s.id,s.managerName,s.companyName,s.roleTitle,s.screenshotFilename,s.emailAddress,s.moduleFocus,s.mainEmail,s.followUp1,s.followUp2,s.finalFollowUp,s.dateCreated,s.dateSent,s.status,s.followUp1SentDate,s.followUp2SentDate,s.finalFollowUpSentDate])];
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
  if (!confirm("This will permanently clear all records for this browser. Continue?")) return;
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
    followUpSchedule: raw.followUpSchedule || null,
    status: raw.status || (raw.dateSent || raw.date_sent ? STATUS.SENT : STATUS.DRAFT),
  };

  if (!spec.managerName || !spec.companyName) return null;
  normalizeStatus(spec);
  return spec;
}

function normalizeAllStatuses() {
  state.specs = state.specs.map((s) => normalizeSpec(s)).filter(Boolean);
}

function normalizeStatus(spec) {
  spec.status = spec.dateSent ? STATUS.SENT : STATUS.DRAFT;
  if (spec.dateSent && !spec.followUpSchedule) {
    spec.followUpSchedule = {
      followUp1Due: getDueDate(spec, 2),
      followUp2Due: getDueDate(spec, 5),
      followUp3Due: getDueDate(spec, 9),
    };
  }
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
window.copyField = copyField;
