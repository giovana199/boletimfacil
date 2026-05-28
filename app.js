// Boletimfácil v5
const STORAGE_KEY = "boletimfacil_subjects_v4";
const OLD_STORAGE_KEYS = [
  "boletimfacil_subjects_v3",
  "boletimfacil_subjects_v2",
  "boletimfacil_subjects_v1"
];

const FIXED_SUBJECT_NAMES = [
  "Argumentação",
  "Biologia",
  "Ed. Física",
  "Religião",
  "Física",
  "Geografia",
  "História",
  "Inglês",
  "Português",
  "Português 1",
  "Literatura",
  "Matemática",
  "Química",
  "Sociologia",
  "Aprofundamento Biologia",
  "Aprofundamento Física",
  "Aprofundamento Química"
];

const $ = id => document.getElementById(id);
const fmtGrade = n => Number.isFinite(n) ? n.toFixed(1).replace(".", ",") : "—";
const parseGrade = value => {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
};
const slug = text => String(text)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const periodLabels = {
  bimester: ["1º Bim", "2º Bim", "3º Bim", "4º Bim"],
  semester: ["1º Sem", "2º Sem"]
};

const state = {
  subjects: [],
  editingId: null,
  filter: "all"
};

function fixedSubject(name) {
  return {
    id: "fixed-" + slug(name),
    fixed: true,
    name,
    periodType: "bimester",
    passingGrade: 6,
    grades: [null, null, null, null],
    createdAt: new Date().toISOString()
  };
}

function normalizeSubject(subject) {
  const periodType = subject.periodType === "semester" ? "semester" : "bimester";
  const len = periodLabels[periodType].length;
  const grades = Array.from({ length: len }, (_, i) => {
    const val = subject.grades?.[i];
    return typeof val === "number" && !Number.isNaN(val) ? Math.max(0, Math.min(10, val)) : null;
  });

  return {
    id: subject.id || "custom-" + Date.now() + "-" + Math.random().toString(16).slice(2),
    fixed: !!subject.fixed || FIXED_SUBJECT_NAMES.some(n => slug(n) === slug(subject.name)),
    name: subject.name || "Matéria",
    periodType,
    passingGrade: Number(subject.passingGrade ?? 6),
    grades,
    createdAt: subject.createdAt || new Date().toISOString(),
    updatedAt: subject.updatedAt
  };
}

function ensureFixedSubjects(subjects) {
  const normalized = (Array.isArray(subjects) ? subjects : [])
    .filter(s => s && s.name)
    .map(normalizeSubject);

  FIXED_SUBJECT_NAMES.forEach(name => {
    const existing = normalized.find(s => slug(s.name) === slug(name));
    if (existing) {
      existing.name = name;
      existing.fixed = true;
      if (!existing.id || existing.id.startsWith("default-")) existing.id = "fixed-" + slug(name);
    } else {
      normalized.push(fixedSubject(name));
    }
  });

  return normalized.sort((a, b) => {
    const ai = FIXED_SUBJECT_NAMES.findIndex(n => slug(n) === slug(a.name));
    const bi = FIXED_SUBJECT_NAMES.findIndex(n => slug(n) === slug(b.name));
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function load() {
  let loaded = null;

  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) loaded = JSON.parse(current);
  } catch {}

  if (!loaded) {
    for (const key of OLD_STORAGE_KEYS) {
      try {
        const old = localStorage.getItem(key);
        if (old) {
          loaded = JSON.parse(old);
          break;
        }
      } catch {}
    }
  }

  state.subjects = ensureFixedSubjects(loaded || []);
  save();
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.subjects));
}

function gradeValues(subject) {
  return (subject.grades || []).filter(v => typeof v === "number" && !Number.isNaN(v));
}

function average(subject) {
  const values = gradeValues(subject);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function statusOf(subject) {
  const avg = average(subject);
  const passing = Number(subject.passingGrade ?? 6);
  if (avg === null) return "risk";
  if (avg >= passing) return "approved";
  if (avg >= passing - 1) return "warning";
  return "risk";
}

function statusText(subject) {
  const status = statusOf(subject);
  if (status === "approved") return "Indo bem";
  if (status === "warning") return "Atenção";
  return "Em risco";
}

function statusClass(subject) {
  const status = statusOf(subject);
  if (status === "approved") return "avg-good";
  if (status === "warning") return "avg-warn";
  return "avg-risk";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function renderGradeInputs(type, grades = []) {
  const labels = periodLabels[type] || periodLabels.bimester;
  $("gradesFields").innerHTML = labels.map((label, i) => `
    <label class="field">
      <span>${label}</span>
      <input class="grade-input" data-i="${i}" type="text" inputmode="decimal" placeholder="Ex: 7,5" value="${grades[i] ?? ""}">
    </label>
  `).join("");
}

function openModal(subject = null) {
  state.editingId = subject?.id || null;
  $("modalTitle").textContent = subject ? "Lançar notas" : "Nova matéria";
  $("subjectName").value = subject?.name || "";
  $("subjectName").disabled = !!subject?.fixed;
  $("periodType").value = subject?.periodType || "bimester";
  $("passingGrade").value = subject?.passingGrade ?? 6;
  renderGradeInputs($("periodType").value, subject?.grades || []);
  $("subjectModal").style.display = "flex";
  setTimeout(() => {
    const firstGrade = document.querySelector(".grade-input");
    if (subject && firstGrade) firstGrade.focus();
    else $("subjectName").focus();
  }, 120);
}

function closeModal() {
  $("subjectModal").style.display = "none";
  $("subjectName").disabled = false;
  state.editingId = null;
}

function saveSubject() {
  const name = $("subjectName").value.trim();
  const periodType = $("periodType").value;
  const passingGrade = Number($("passingGrade").value || 6);
  const labels = periodLabels[periodType];
  const grades = Array.from(document.querySelectorAll(".grade-input"))
    .slice(0, labels.length)
    .map(input => parseGrade(input.value));

  if (!name) {
    alert("Informe o nome da matéria.");
    return;
  }

  if (state.editingId) {
    const idx = state.subjects.findIndex(s => s.id === state.editingId);
    if (idx >= 0) {
      const previous = state.subjects[idx];
      state.subjects[idx] = {
        ...previous,
        name: previous.fixed ? previous.name : name,
        periodType,
        passingGrade,
        grades,
        updatedAt: new Date().toISOString()
      };
    }
  } else {
    state.subjects.push({
      id: "custom-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      fixed: false,
      name,
      periodType,
      passingGrade,
      grades,
      createdAt: new Date().toISOString()
    });
  }

  state.subjects = ensureFixedSubjects(state.subjects);
  save();
  closeModal();
  render();
}

function openModalById(id) {
  openModal(state.subjects.find(s => s.id === id));
}

function deleteSubject(id) {
  const subject = state.subjects.find(s => s.id === id);
  if (!subject) return;

  if (subject.fixed) {
    alert("Essa matéria é fixa e não pode ser excluída. Você pode apenas editar as notas.");
    return;
  }

  if (!confirm(`Excluir a matéria "${subject.name}"?`)) return;
  state.subjects = state.subjects.filter(s => s.id !== id);
  save();
  render();
}

function buildInsight(subject, needed, remaining) {
  const avg = average(subject);
  const passing = Number(subject.passingGrade ?? 6);
  if (avg === null) return "Ainda não há notas lançadas. Toque em editar e preencha as notas do período.";
  if (avg >= passing && remaining === 0) return "Fechou o período acima da média. Muito bom!";
  if (avg >= passing) return "Está acima da média. Continue mantendo esse ritmo nos próximos períodos.";
  if (remaining > 0) return `Ainda dá para recuperar. Foque nas próximas avaliações para subir pelo menos ${fmtGrade(needed)} ponto(s) na média atual.`;
  return "A média ficou abaixo do necessário. Vale planejar recuperação ou atividades extras.";
}

function showDetails(id) {
  const subject = state.subjects.find(s => s.id === id);
  if (!subject) return;
  const avg = average(subject);
  const passing = Number(subject.passingGrade ?? 6);
  const needed = avg === null ? passing : Math.max(0, passing - avg);
  const remaining = (subject.grades || []).filter(v => v === null || v === undefined).length;

  $("detailTitle").textContent = subject.name;
  $("detailContent").innerHTML = `
    <div class="detail-box">
      <h3>Status</h3>
      <p><strong>${statusText(subject)}</strong> · Média atual ${fmtGrade(avg)} · Média necessária ${fmtGrade(passing)}</p>
    </div>
    <div class="detail-box">
      <h3>Notas</h3>
      <p>${periodLabels[subject.periodType].map((label, i) => `${label}: <strong>${fmtGrade(subject.grades?.[i])}</strong>`).join("<br>")}</p>
    </div>
    <div class="detail-box">
      <h3>Insight</h3>
      <p>${buildInsight(subject, needed, remaining)}</p>
    </div>
  `;
  $("detailModal").style.display = "flex";
}

function renderHeader() {
  const subjects = state.subjects;
  const avgs = subjects.map(average).filter(v => v !== null);
  const overall = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const approved = subjects.filter(s => statusOf(s) === "approved").length;
  const warning = subjects.filter(s => statusOf(s) === "warning").length;
  const risk = subjects.filter(s => statusOf(s) === "risk").length;

  $("overallAverage").textContent = fmtGrade(overall);
  $("subjectCount").textContent = `${subjects.length} ${subjects.length === 1 ? "matéria" : "matérias"}`;
  $("approvedCount").textContent = approved;
  $("warningCount").textContent = warning;
  $("riskCount").textContent = risk;

  if (!subjects.length) $("overallStatus").textContent = "Cadastre suas matérias para começar";
  else if (risk > 0) $("overallStatus").textContent = `${risk} matéria(s) precisam de atenção agora`;
  else if (warning > 0) $("overallStatus").textContent = `${warning} matéria(s) perto da média`;
  else $("overallStatus").textContent = "Mandando bem no ano letivo!";
}

function renderSubjects() {
  let list = [...state.subjects];

  if (state.filter !== "all") list = list.filter(s => statusOf(s) === state.filter);

  $("periodLabel").textContent = state.subjects.some(s => s.periodType === "semester") ? "Bimestres/Semestres" : "Bimestres";

  if (!list.length) {
    $("subjectsList").innerHTML = `<div class="empty">📚<br>Nenhuma matéria nesse filtro.</div>`;
    return;
  }

  $("subjectsList").innerHTML = list.map(subject => {
    const avg = average(subject);
    const labels = periodLabels[subject.periodType] || periodLabels.bimester;
    const deleteButton = subject.fixed
      ? `<button class="icon-btn muted" onclick="openModalById('${subject.id}')">Lançar nota</button>`
      : `<button class="icon-btn danger" onclick="deleteSubject('${subject.id}')">Excluir</button>`;

    return `
      <article class="subject-card">
        <div class="subject-top">
          <div>
            <div class="subject-name">${escapeHtml(subject.name)}</div>
            <div class="subject-meta">${subject.periodType === "semester" ? "Semestral" : "Bimestral"} · ${statusText(subject)}</div>
          </div>
          <div class="avg-badge ${statusClass(subject)}">
            <small>Média</small>
            ${fmtGrade(avg)}
          </div>
        </div>
        <div class="grade-dots" style="grid-template-columns: repeat(${labels.length},1fr)">
          ${labels.map((label, i) => `
            <button class="grade-dot grade-button" onclick="openModalById('${subject.id}')">
              <span>${label}</span>
              <strong>${fmtGrade(subject.grades?.[i])}</strong>
            </button>
          `).join("")}
        </div>
        <div class="card-actions">
          <button class="icon-btn primary" onclick="showDetails('${subject.id}')">Ver resumo</button>
          <button class="icon-btn" onclick="openModalById('${subject.id}')">Editar notas</button>
          ${deleteButton}
        </div>
      </article>
    `;
  }).join("");
}

function render() {
  renderHeader();
  renderSubjects();
}

function exportData() {
  const payload = {
    app: "Boletimfácil",
    version: 5,
    exportedAt: new Date().toISOString(),
    subjects: state.subjects
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `boletimfacil-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}


function importDataFromFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      const importedSubjects = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.subjects)
          ? payload.subjects
          : null;

      if (!importedSubjects) {
        alert("Arquivo inválido. Selecione um backup exportado pelo Boletimfácil.");
        return;
      }

      const shouldImport = confirm("Importar este backup? As notas atuais serão combinadas com as matérias fixas do app.");
      if (!shouldImport) return;

      state.subjects = ensureFixedSubjects(importedSubjects);
      save();
      render();

      alert("Backup importado com sucesso!");
    } catch (error) {
      alert("Não foi possível ler o arquivo. Verifique se é um .json válido do Boletimfácil.");
    } finally {
      $("importFile").value = "";
    }
  };

  reader.readAsText(file, "utf-8");
}

function bindEvents() {
  $("addBtn").addEventListener("click", () => openModal());
  $("closeModal").addEventListener("click", closeModal);
  $("saveSubject").addEventListener("click", saveSubject);
  $("periodType").addEventListener("change", () => renderGradeInputs($("periodType").value, []));

  document.addEventListener("blur", e => {
    if (e.target.classList && e.target.classList.contains("grade-input")) {
      const n = parseGrade(e.target.value);
      e.target.value = n === null ? "" : fmtGrade(n);
    }
  }, true);

  $("closeDetail").addEventListener("click", () => $("detailModal").style.display = "none");
  $("exportBtn").addEventListener("click", exportData);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", e => importDataFromFile(e.target.files?.[0]));

  document.querySelectorAll(".pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.filter = btn.dataset.filter;
      renderSubjects();
    });
  });

  $("subjectModal").addEventListener("click", e => { if (e.target.id === "subjectModal") closeModal(); });
  $("detailModal").addEventListener("click", e => { if (e.target.id === "detailModal") $("detailModal").style.display = "none"; });
}

let refreshing = false;
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("./sw.js?v=5");
    reg.update();

    setInterval(() => reg.update(), 60 * 60 * 1000);

    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update();
    });
  } catch (e) {
    console.warn("Service worker não registrado", e);
  }
}

load();
bindEvents();
render();
registerSW();
