const STORAGE_KEY = "bdSpecGenerator.specs.v1";
const API_KEY_KEY = "bdSpecGenerator.openaiApiKey";

const defaults = {
  moduleFocus: "SAP FI/CO",
  targetCountry: "France",
  availability: "Immediate",
  location: "France (flexible across EU projects)",
};

const state = { specs: loadSpecs() };

const els = {
  apiKey: document.getElementById("apiKey"),
  screenshot: document.getElementById("screenshot"),
  moduleFocus: document.getElementById("moduleFocus"),
  targetCountry: document.getElementById("targetCountry"),
  candidateType: document.getElementById("candidateType"),
  marketContext: document.getElementById("marketContext"),
  managerName: document.getElementById("managerName"),
  companyName: document.getElementById("companyName"),
  roleTitle: document.getElementById("roleTitle"),
  detectedContext: document.getElementById("detectedContext"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  generateBtn: document.getElementById("generateBtn"),
  analysisMessage: document.getElementById("analysisMessage"),
  specList: document.getElementById("specList"),
  exportBtn: document.getElementById("exportBtn"),
  clearBtn: document.getElementById("clearBtn"),
  dueToday: document.getElementById("dueToday"),
};

init();

function init() {
  els.apiKey.value = localStorage.getItem(API_KEY_KEY) || "";
  els.apiKey.addEventListener("change", () => {
    localStorage.setItem(API_KEY_KEY, els.apiKey.value.trim());
  });

  els.analyzeBtn.addEventListener("click", analyzeScreenshot);
  els.generateBtn.addEventListener("click", generateSpec);
  els.exportBtn.addEventListener("click", exportCsv);
  els.clearBtn.addEventListener("click", clearDay);

  render();
}

async function analyzeScreenshot() {
  const file = els.screenshot.files[0];
  const apiKey = getApiKey();

  if (!file) {
    setMessage("Please upload a screenshot first.");
    return;
  }
  if (!apiKey) {
    setMessage("Please add your OpenAI API key.");
    return;
  }

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
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              {
                type: "input_image",
                image_url: `data:${file.type};base64,${base64Image}`,
              },
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

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || "Vision analysis failed");
    }

    const payload = await response.json();
    const jsonText = payload.output_text;
    const extracted = JSON.parse(jsonText);

    els.managerName.value = extracted.manager_name || "";
    els.companyName.value = extracted.company_name || "";
    els.roleTitle.value = extracted.role_title || "";
    els.detectedContext.value = extracted.sap_hiring_context || "";

    let msg = "Analysis complete.";
    if (!extracted.manager_name || !extracted.company_name) {
      msg += " Name or company was unclear. Please fill missing fields manually.";
    }
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

  if (!managerName || !companyName) {
    setMessage("Please fill manager name and company name manually if not detected.");
    return;
  }

  const moduleFocus = clean(els.moduleFocus.value) || defaults.moduleFocus;
  const targetCountry = clean(els.targetCountry.value) || defaults.targetCountry;
  const candidateType = clean(els.candidateType.value) || `${moduleFocus} Consultant`;
  const marketContext = clean(els.marketContext.value) || "S/4HANA programme";
  const roleTitle = clean(els.roleTitle.value);
  const detectedContext = clean(els.detectedContext.value);

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

Is this not the type of ${moduleFocus} profile you are currently looking for, or is it simply a matter of timing?

Either way, it would be helpful to understand so I can keep future messages relevant.

Best regards,
Joe`;

  const followUp2 = `Hi ${managerName},

Just checking whether this ${moduleFocus} profile could be relevant for any current or upcoming S/4HANA Finance work at ${companyName}.

If not, no problem — I would appreciate knowing so I can avoid sending irrelevant profiles.

Best regards,
Joe`;

  const finalFollowUp = `Hi ${managerName},

As I have not heard back, should I assume this profile is not relevant at the moment?

Best regards,
Joe`;

  const spec = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    managerName,
    companyName,
    roleTitle,
    detectedContext,
    moduleFocus,
    targetCountry,
    candidateType,
    marketContext: introContext,
    subject,
    mainEmail,
    followUp1,
    followUp2,
    finalFollowUp,
    status: "Draft",
    sentDate: "",
    followUpDueDate: "",
    followUpCompletedDate: "",
  };

  state.specs.unshift(spec);
  persistSpecs();
  render();
  setMessage("Spec generated and saved to Today's Specs.");
}

function markSent(id) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec) return;

  const sentDate = new Date();
  const dueDate = new Date(sentDate);
  dueDate.setDate(dueDate.getDate() + 2);

  spec.sentDate = isoDate(sentDate);
  spec.followUpDueDate = isoDate(dueDate);
  spec.status = "Sent";

  persistSpecs();
  render();
}

function markFollowedUp(id) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec) return;
  spec.followUpCompletedDate = isoDate(new Date());
  spec.status = "Followed Up";

  persistSpecs();
  render();
}

function currentStatus(spec) {
  if (spec.status === "Followed Up") return "Followed Up";
  if (spec.sentDate && spec.followUpDueDate && isDueTodayOrPast(spec.followUpDueDate)) return "Follow-up Due";
  if (spec.sentDate) return "Sent";
  return "Draft";
}

function render() {
  renderDueToday();

  if (!state.specs.length) {
    els.specList.innerHTML = `<p class="empty">No specs generated yet.</p>`;
    return;
  }

  els.specList.innerHTML = state.specs
    .map((spec) => {
      const status = currentStatus(spec);
      return `
      <article class="spec-item">
        <div class="spec-head">
          <strong>${escapeHtml(spec.managerName)} @ ${escapeHtml(spec.companyName)}</strong>
          <span class="badge">${status}</span>
        </div>
        <p class="hint">Created: ${formatDate(spec.createdAt)}${spec.sentDate ? ` | Sent: ${spec.sentDate}` : ""}${spec.followUpDueDate ? ` | Follow-up due: ${spec.followUpDueDate}` : ""}</p>

        ${renderOutput("Subject", spec.subject, spec.id, "subject")}
        ${renderOutput("Main Email", spec.mainEmail, spec.id, "main")}
        ${renderOutput("Follow-up 1", spec.followUp1, spec.id, "f1")}
        ${renderOutput("Follow-up 2", spec.followUp2, spec.id, "f2")}
        ${renderOutput("Final Follow-up", spec.finalFollowUp, spec.id, "f3")}

        <div class="actions">
          ${!spec.sentDate ? `<button onclick="markSent('${spec.id}')">Mark as Sent</button>` : ""}
          ${spec.sentDate && !spec.followUpCompletedDate ? `<button onclick="markFollowedUp('${spec.id}')">Mark Follow-up Completed</button>` : ""}
        </div>
      </article>`;
    })
    .join("");
}

function renderDueToday() {
  const due = state.specs.filter(
    (s) => s.sentDate && !s.followUpCompletedDate && s.followUpDueDate && isDueTodayOrPast(s.followUpDueDate)
  );

  if (!due.length) {
    els.dueToday.innerHTML = "No follow-ups due today.";
    return;
  }

  els.dueToday.innerHTML = due
    .map(
      (s) => `<div class="due-item">
        <strong>${escapeHtml(s.managerName)} @ ${escapeHtml(s.companyName)}</strong><br />
        Due: ${s.followUpDueDate} 
        <button onclick="markFollowedUp('${s.id}')">Mark Completed</button>
      </div>`
    )
    .join("");
}

function renderOutput(title, text, id, key) {
  return `<div class="output-block">
    <p class="output-title">${title}</p>
    <div class="output-text">${escapeHtml(text)}</div>
    <div class="copy-row"><button onclick="copyField('${id}','${key}')">Copy ${title}</button></div>
  </div>`;
}

function copyField(id, key) {
  const spec = state.specs.find((s) => s.id === id);
  if (!spec) return;
  const valueMap = {
    subject: spec.subject,
    main: spec.mainEmail,
    f1: spec.followUp1,
    f2: spec.followUp2,
    f3: spec.finalFollowUp,
  };

  navigator.clipboard.writeText(valueMap[key] || "").then(() => setMessage("Copied."));
}

function exportCsv() {
  if (!state.specs.length) {
    setMessage("No specs to export.");
    return;
  }

  const rows = [
    [
      "created_at",
      "manager_name",
      "company_name",
      "status",
      "sent_date",
      "follow_up_due_date",
      "follow_up_completed_date",
      "subject",
      "main_email",
      "follow_up_1",
      "follow_up_2",
      "final_follow_up",
    ],
    ...state.specs.map((s) => [
      s.createdAt,
      s.managerName,
      s.companyName,
      currentStatus(s),
      s.sentDate,
      s.followUpDueDate,
      s.followUpCompletedDate,
      s.subject,
      s.mainEmail,
      s.followUp1,
      s.followUp2,
      s.finalFollowUp,
    ]),
  ];

  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bd-specs-${isoDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearDay() {
  if (!confirm("Clear all today's specs?")) return;
  state.specs = [];
  persistSpecs();
  render();
}

function loadSpecs() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function persistSpecs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.specs));
}

function getApiKey() {
  const key = els.apiKey.value.trim();
  if (key) localStorage.setItem(API_KEY_KEY, key);
  return key;
}

function setMessage(msg) {
  els.analysisMessage.textContent = msg;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result.split(",")[1];
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function isDueTodayOrPast(yyyyMmDd) {
  const today = isoDate(new Date());
  return yyyyMmDd <= today;
}

function csvCell(val) {
  const str = String(val ?? "").replaceAll('"', '""');
  return `"${str}"`;
}

function clean(v) {
  return (v || "").trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.markSent = markSent;
window.markFollowedUp = markFollowedUp;
window.copyField = copyField;
