import { useState, useEffect } from "react";

const COLORS = {
  bg: "#0F1117", surface: "#181C27", surfaceHigh: "#1F2535",
  border: "#2A3049", amber: "#F5A623", amberDim: "#7A5010",
  teal: "#38BDF8", tealDim: "#0C3D56", green: "#4ADE80",
  red: "#F87171", muted: "#5A6480", text: "#E8EBF4", textSoft: "#9099B5",
};
const STATUS_COLORS = { "activo": COLORS.green, "en pausa": COLORS.amber, "algún día": COLORS.muted };
const PRIORITY_LABELS = ["Alta", "Media", "Baja"];
const PRIORITY_COLORS = { Alta: COLORS.red, Media: COLORS.amber, Baja: COLORS.teal };
function uid() { return Math.random().toString(36).slice(2, 9); }
const inputStyle = {
  width: "100%", background: COLORS.surfaceHigh, border: `1px solid ${COLORS.border}`,
  borderRadius: 8, color: COLORS.text, fontSize: 14, padding: "9px 12px", boxSizing: "border-box",
};

// ─── ALGORITMO DE AGENDA (sin IA) ────────────────────────────────────────────
const AGENDA_COLORS = ["#38BDF8","#4ADE80","#F5A623","#A78BFA","#FB923C","#34D399","#F472B6","#60A5FA"];

function buildAgenda(activeProjects, weekHours) {
  const DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

  // 1. Distribuir horas por prioridad (50/30/20), normalizado si faltan grupos
  const grupos = {
    Alta:  activeProjects.filter(p => p.priority === "Alta"),
    Media: activeProjects.filter(p => p.priority === "Media"),
    Baja:  activeProjects.filter(p => p.priority === "Baja"),
  };
  const pesos = {
    Alta:  grupos.Alta.length  ? 0.5 : 0,
    Media: grupos.Media.length ? 0.3 : 0,
    Baja:  grupos.Baja.length  ? 0.2 : 0,
  };
  const totalPeso = pesos.Alta + pesos.Media + pesos.Baja || 1;
  Object.keys(pesos).forEach(k => { pesos[k] /= totalPeso; });

  // 2. Horas y color por proyecto
  const meta = {};
  activeProjects.forEach((p, i) => {
    const nGrupo = grupos[p.priority].length || 1;
    const horas = Math.round(pesos[p.priority] * weekHours / nGrupo * 2) / 2;
    meta[p.id] = { horas, color: AGENDA_COLORS[i % AGENDA_COLORS.length] };
  });

  // 3. Construir bloques y distribuirlos en días
  const dias = DAYS.map(dia => ({ dia, bloques: [] }));
  const sinCubrir = [];
  const distribucion = [];

  for (const project of activeProjects) {
    const { horas: totalHoras, color } = meta[project.id];
    distribucion.push({ proyecto: project.name, horas: totalHoras, color });

    // Instrucciones especiales en descripción
    const desc = (project.description || "").toLowerCase();
    const minsMatch = desc.match(/(\d+)\s*min/);
    const esDiario = desc.includes("diario") || !!minsMatch;

    // Tamaño de bloque
    let tamBloque = minsMatch
      ? Math.max(0.5, Math.round(parseInt(minsMatch[1]) / 60 * 2) / 2)
      : Math.min(2, Math.max(0.5, Math.round(totalHoras / 5 * 2) / 2));

    const tareasPendientes = project.tasks.filter(t => !t.done);
    let horasRestantes = totalHoras;

    // Si no hay tareas, bloque genérico
    const fuente = tareasPendientes.length > 0
      ? tareasPendientes
      : [{ text: "Avance general del proyecto" }];

    const bloquesList = [];
    for (const tarea of fuente) {
      if (horasRestantes < 0.5) {
        if (tareasPendientes.length > 0) {
          sinCubrir.push({ proyecto: project.name, tarea: tarea.text, razon: "No alcanzaron las horas disponibles esta semana" });
        }
        continue;
      }
      const hrs = Math.min(tamBloque, horasRestantes);
      bloquesList.push({ proyecto: project.name, tarea: tarea.text, horas: hrs, done: false });
      horasRestantes -= hrs;
    }

    // Distribuir bloques: siempre en el día con menos carga (distribución pareja)
    for (const bloque of bloquesList) {
      const sorted = dias
        .map((d, i) => ({ i, total: d.bloques.reduce((a, b) => a + b.horas, 0) }))
        .sort((a, b) => a.total - b.total);
      dias[sorted[0].i].bloques.push(bloque);
    }
  }

  // 4. Resumen y advertencia
  const lista = activeProjects.map(p => `${p.name} (${meta[p.id].horas}h)`).join(", ");
  const resumen = `Semana de ${weekHours}h distribuidas en ${activeProjects.length} proyecto${activeProjects.length !== 1 ? "s" : ""}: ${lista}. Los proyectos de alta prioridad tienen el mayor peso.`;
  const advertencia = sinCubrir.length > 0
    ? `${sinCubrir.length} tarea${sinCubrir.length !== 1 ? "s" : ""} no cupo esta semana. Considera reducir proyectos activos o aumentar las horas disponibles.`
    : null;

  return { generatedAt: new Date().toISOString(), weekHours, resumen, advertencia, sinCubrir, distribucion, dias };
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("proyectos");
  const [projects, setProjects] = useState([]);
  const [weekHours, setWeekHours] = useState(30);
  const [agenda, setAgenda] = useState(null);
  const [agendaError, setAgendaError] = useState("");
  const [showAddProject, setShowAddProject] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [newTask, setNewTask] = useState({});

  // Persistencia en localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("miSemanaFoco");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.projects) setProjects(data.projects);
        if (data.weekHours != null) setWeekHours(data.weekHours);
        if (data.agenda) setAgenda(data.agenda);
      }
    } catch (e) {}
  }, []);
  useEffect(() => {
    localStorage.setItem("miSemanaFoco", JSON.stringify({ projects, weekHours, agenda }));
  }, [projects, weekHours, agenda]);

  function saveProject(data) {
    if (data.id) setProjects(p => p.map(x => x.id === data.id ? data : x));
    else setProjects(p => [...p, { ...data, id: uid(), tasks: [] }]);
    setShowAddProject(false); setEditingProject(null);
  }
  function deleteProject(id) { setProjects(p => p.filter(x => x.id !== id)); }
  function addTask(projectId, text) {
    if (!text.trim()) return;
    setProjects(p => p.map(x => x.id === projectId ? { ...x, tasks: [...x.tasks, { id: uid(), text, done: false }] } : x));
    setNewTask(t => ({ ...t, [projectId]: "" }));
  }
  function toggleTask(projectId, taskId) {
    setProjects(p => p.map(x => x.id === projectId
      ? { ...x, tasks: x.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : x));
  }
  function deleteTask(projectId, taskId) {
    setProjects(p => p.map(x => x.id === projectId ? { ...x, tasks: x.tasks.filter(t => t.id !== taskId) } : x));
  }

  // ── Edit agenda block ──────────────────────────────────────────────────────
  function toggleBloqueDone(diaIdx, bloqueIdx) {
    setAgenda(a => {
      const dias = a.dias.map((d, di) => di !== diaIdx ? d : {
        ...d, bloques: d.bloques.map((b, bi) => bi !== bloqueIdx ? b : { ...b, done: !b.done })
      });
      return { ...a, dias };
    });
  }
  function editBloqueText(diaIdx, bloqueIdx, field, value) {
    setAgenda(a => {
      const dias = a.dias.map((d, di) => di !== diaIdx ? d : {
        ...d, bloques: d.bloques.map((b, bi) => bi !== bloqueIdx ? b : { ...b, [field]: value })
      });
      return { ...a, dias };
    });
  }
  function deleteBloque(diaIdx, bloqueIdx) {
    setAgenda(a => {
      const dias = a.dias.map((d, di) => di !== diaIdx ? d : {
        ...d, bloques: d.bloques.filter((_, bi) => bi !== bloqueIdx)
      });
      return { ...a, dias };
    });
  }
  function addBloque(diaIdx) {
    setAgenda(a => {
      const dias = a.dias.map((d, di) => di !== diaIdx ? d : {
        ...d, bloques: [...d.bloques, { proyecto: projects[0]?.name || "Proyecto", tarea: "Nueva tarea", horas: 1, done: false, isNew: true }]
      });
      return { ...a, dias };
    });
  }

  // ── Generador de agenda (sin API) ─────────────────────────────────────────
  function generateAgenda() {
    const activeProjects = projects.filter(p => p.status === "activo");
    if (activeProjects.length === 0) {
      setAgendaError("No tienes proyectos activos. Agrega al menos uno antes de generar la agenda.");
      setTab("agenda");
      return;
    }
    setAgendaError("");
    setAgenda(buildAgenda(activeProjects, weekHours));
    setTab("agenda");
  }

  const completedBlocks = agenda ? agenda.dias.flatMap(d => d.bloques).filter(b => b.done).length : 0;
  const totalBlocks = agenda ? agenda.dias.flatMap(d => d.bloques).length : 0;

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ borderBottom: `1px solid ${COLORS.border}`, padding: "20px 24px 0" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.15em", color: COLORS.amber, textTransform: "uppercase", marginBottom: 4 }}>Sistema de proyectos</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Mi semana con foco</h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {agenda && totalBlocks > 0 && (
                <div style={{ fontSize: 12, color: COLORS.textSoft, background: COLORS.surfaceHigh, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "4px 12px" }}>
                  ✓ {completedBlocks}/{totalBlocks} bloques
                </div>
              )}
              <span style={{ fontSize: 12, color: COLORS.muted }}>Horas/semana</span>
              <input type="number" value={weekHours} onChange={e => setWeekHours(Number(e.target.value))} min={1} max={80}
                style={{ width: 56, background: COLORS.surfaceHigh, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 15, fontWeight: 700, textAlign: "center", padding: "4px 8px" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            {[["proyectos", "Proyectos"], ["agenda", "Agenda"], ["semana", "Vista semana"]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                style={{ background: "none", border: "none", borderBottom: tab === key ? `2px solid ${COLORS.amber}` : "2px solid transparent", color: tab === key ? COLORS.amber : COLORS.muted, fontSize: 13, fontWeight: 600, padding: "8px 18px", cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px" }}>

        {/* ── PROYECTOS ── */}
        {tab === "proyectos" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 13, color: COLORS.textSoft }}>
                {projects.filter(p => p.status === "activo").length} activos · {projects.filter(p => p.status === "en pausa").length} en pausa · {projects.filter(p => p.status === "algún día").length} algún día
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={generateAgenda} style={{ background: COLORS.amber, color: "#000", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✦ Generar agenda</button>
                <button onClick={() => setShowAddProject(true)} style={{ background: COLORS.surfaceHigh, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>+ Proyecto</button>
              </div>
            </div>
            {projects.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: COLORS.muted }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 15, marginBottom: 6 }}>Sin proyectos aún</div>
                <div style={{ fontSize: 13 }}>Agrega tu primer proyecto para empezar</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {projects.map(project => (
                <ProjectCard key={project.id} project={project}
                  onEdit={() => setEditingProject(project)} onDelete={() => deleteProject(project.id)}
                  onToggleTask={(tid) => toggleTask(project.id, tid)} onDeleteTask={(tid) => deleteTask(project.id, tid)}
                  onAddTask={(text) => addTask(project.id, text)}
                  newTaskText={newTask[project.id] || ""} onNewTaskChange={(v) => setNewTask(t => ({ ...t, [project.id]: v }))} />
              ))}
            </div>
          </div>
        )}

        {/* ── AGENDA ── */}
        {tab === "agenda" && (
          <div>
            {agendaError && <div style={{ background: "#2A1A1A", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: 18, color: COLORS.red, fontSize: 14, marginBottom: 16 }}>{agendaError}</div>}
            {!agenda && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: COLORS.muted }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✦</div>
                <div style={{ fontSize: 15, marginBottom: 8 }}>La agenda aparecerá aquí</div>
                <div style={{ fontSize: 13, marginBottom: 24 }}>Agrega proyectos activos y presiona "Generar agenda"</div>
                <button onClick={generateAgenda} style={{ background: COLORS.amber, color: "#000", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✦ Generar agenda</button>
              </div>
            )}
            {agenda && (
              <AgendaView agenda={agenda} weekHours={weekHours} onRegenerate={generateAgenda}
                onToggleDone={toggleBloqueDone} onEditBloque={editBloqueText}
                onDeleteBloque={deleteBloque} onAddBloque={addBloque} projects={projects} />
            )}
          </div>
        )}

        {/* ── SEMANA ── */}
        {tab === "semana" && <WeekView agenda={agenda} />}
      </div>

      {(showAddProject || editingProject) && (
        <ProjectModal project={editingProject} onSave={saveProject} onClose={() => { setShowAddProject(false); setEditingProject(null); }} />
      )}
    </div>
  );
}

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────
function ProjectCard({ project, onEdit, onDelete, onToggleTask, onDeleteTask, onAddTask, newTaskText, onNewTaskChange }) {
  const [expanded, setExpanded] = useState(false);
  const pendingCount = project.tasks.filter(t => !t.done).length;
  const doneCount = project.tasks.filter(t => t.done).length;
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLORS[project.priority], marginTop: 7, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{project.name}</span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: COLORS.surfaceHigh, color: STATUS_COLORS[project.status], border: `1px solid ${STATUS_COLORS[project.status]}40` }}>{project.status}</span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: COLORS.surfaceHigh, color: COLORS.muted }}>{project.type}</span>
          </div>
          {project.description && <div style={{ fontSize: 13, color: COLORS.textSoft, marginTop: 4 }}>{project.description}</div>}
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12, color: COLORS.muted, flexWrap: "wrap" }}>
            <span style={{ color: PRIORITY_COLORS[project.priority] }}>● {project.priority}</span>
            <span>{project.hoursPerWeek}h/sem</span>
            <span>{pendingCount} pendientes</span>
            {doneCount > 0 && <span style={{ color: COLORS.green }}>✓ {doneCount} listas</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => setExpanded(e => !e)} style={{ background: COLORS.surfaceHigh, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.textSoft, fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>
            {expanded ? "↑" : `↓ (${project.tasks.length})`}
          </button>
          <button onClick={onEdit} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.muted, fontSize: 12, padding: "4px 8px", cursor: "pointer" }}>✎</button>
          <button onClick={onDelete} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.red, fontSize: 12, padding: "4px 8px", cursor: "pointer" }}>✕</button>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 18px 14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {project.tasks.length === 0 && <div style={{ fontSize: 12, color: COLORS.muted }}>Sin tareas aún</div>}
            {project.tasks.map(task => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={task.done} onChange={() => onToggleTask(task.id)} style={{ accentColor: COLORS.green, width: 14, height: 14, flexShrink: 0 }} />
                <span style={{ fontSize: 13, flex: 1, color: task.done ? COLORS.muted : COLORS.text, textDecoration: task.done ? "line-through" : "none" }}>{task.text}</span>
                <button onClick={() => onDeleteTask(task.id)} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 12 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newTaskText} onChange={e => onNewTaskChange(e.target.value)} onKeyDown={e => e.key === "Enter" && onAddTask(newTaskText)}
              placeholder="Nueva tarea… (Enter)" style={{ flex: 1, background: COLORS.surfaceHigh, border: `1px solid ${COLORS.border}`, borderRadius: 7, color: COLORS.text, fontSize: 13, padding: "7px 12px" }} />
            <button onClick={() => onAddTask(newTaskText)} style={{ background: COLORS.tealDim, border: `1px solid ${COLORS.teal}40`, borderRadius: 7, color: COLORS.teal, fontSize: 13, padding: "7px 14px", cursor: "pointer", fontWeight: 600 }}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AGENDA VIEW ──────────────────────────────────────────────────────────────
function AgendaView({ agenda, weekHours, onRegenerate, onToggleDone, onEditBloque, onDeleteBloque, onAddBloque, projects }) {
  const [editingBlock, setEditingBlock] = useState(null); // {diaIdx, bloqueIdx}

  return (
    <div>
      {/* Summary */}
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: COLORS.amber, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Resumen de la semana</div>
            <div style={{ fontSize: 15, color: COLORS.text }}>{agenda.resumen}</div>
            {agenda.advertencia && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#2A1F10", border: `1px solid ${COLORS.amberDim}`, borderRadius: 8, fontSize: 13, color: COLORS.amber }}>⚠ {agenda.advertencia}</div>
            )}
          </div>
          <button onClick={onRegenerate} style={{ background: COLORS.surfaceHigh, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.textSoft, fontSize: 12, padding: "6px 14px", cursor: "pointer" }}>↺ Regenerar</button>
        </div>
      </div>

      {/* Lo que NO cupo */}
      {agenda.sinCubrir && agenda.sinCubrir.length > 0 && (
        <div style={{ background: "#1A1A2E", border: `1px solid #3A2060`, borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>📦 Quedó fuera esta semana</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {agenda.sinCubrir.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 3, background: "#7C3AED", borderRadius: 2, alignSelf: "stretch", minHeight: 16, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: "#A78BFA", marginBottom: 2 }}>{item.proyecto}</div>
                  <div style={{ fontSize: 13, color: COLORS.text }}>{item.tarea}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{item.razon}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Distribución */}
      {agenda.distribucion && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Distribución de energía — {weekHours}h</div>
          <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex" }}>
            {agenda.distribucion.map((d, i) => (
              <div key={i} title={`${d.proyecto}: ${d.horas}h`} style={{ height: "100%", width: `${(d.horas / weekHours) * 100}%`, background: d.color || COLORS.teal }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
            {agenda.distribucion.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color || COLORS.teal }} />
                <span style={{ color: COLORS.textSoft }}>{d.proyecto}</span>
                <span style={{ color: COLORS.text, fontWeight: 600 }}>{d.horas}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Días */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {agenda.dias?.map((day, diaIdx) => {
          const doneBloques = day.bloques.filter(b => b.done).length;
          return (
            <div key={diaIdx} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 18px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{day.dia}</span>
                  {doneBloques > 0 && <span style={{ fontSize: 11, color: COLORS.green }}>✓ {doneBloques}/{day.bloques.length}</span>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: COLORS.muted }}>{day.bloques.reduce((a, b) => a + (b.horas || 0), 0)}h</span>
                  <button onClick={() => onAddBloque(diaIdx)}
                    style={{ background: COLORS.tealDim, border: `1px solid ${COLORS.teal}30`, borderRadius: 6, color: COLORS.teal, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>+ bloque</button>
                </div>
              </div>
              <div style={{ padding: "10px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                {day.bloques.length === 0 && <div style={{ fontSize: 13, color: COLORS.muted }}>Sin bloques — usa "+ bloque" para agregar</div>}
                {day.bloques.map((bloque, bloqueIdx) => {
                  const dist = agenda.distribucion?.find(d => d.proyecto === bloque.proyecto);
                  const color = dist?.color || COLORS.teal;
                  const isEditing = editingBlock?.diaIdx === diaIdx && editingBlock?.bloqueIdx === bloqueIdx;
                  return (
                    <div key={bloqueIdx} style={{ display: "flex", gap: 10, alignItems: "flex-start", opacity: bloque.done ? 0.5 : 1 }}>
                      {/* Checkbox */}
                      <input type="checkbox" checked={!!bloque.done} onChange={() => onToggleDone(diaIdx, bloqueIdx)}
                        style={{ accentColor: COLORS.green, width: 15, height: 15, flexShrink: 0, marginTop: 3 }} />
                      <div style={{ width: 3, borderRadius: 2, background: color, flexShrink: 0, alignSelf: "stretch", minHeight: 20 }} />
                      <div style={{ flex: 1 }}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <input value={bloque.proyecto} onChange={e => onEditBloque(diaIdx, bloqueIdx, "proyecto", e.target.value)}
                              style={{ ...inputStyle, fontSize: 12, padding: "5px 8px" }} placeholder="Proyecto" />
                            <input value={bloque.tarea} onChange={e => onEditBloque(diaIdx, bloqueIdx, "tarea", e.target.value)}
                              style={{ ...inputStyle, fontSize: 12, padding: "5px 8px" }} placeholder="Descripción de la tarea" />
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input type="number" value={bloque.horas} onChange={e => onEditBloque(diaIdx, bloqueIdx, "horas", Number(e.target.value))}
                                min={0.5} max={12} step={0.5} style={{ ...inputStyle, width: 70, fontSize: 12, padding: "5px 8px" }} />
                              <span style={{ fontSize: 11, color: COLORS.muted }}>horas</span>
                              <button onClick={() => setEditingBlock(null)} style={{ marginLeft: "auto", background: COLORS.amber, border: "none", borderRadius: 6, color: "#000", fontSize: 11, padding: "4px 12px", cursor: "pointer", fontWeight: 700 }}>Listo</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 11, color, marginBottom: 2 }}>{bloque.proyecto} · {bloque.horas}h</div>
                            <div style={{ fontSize: 13, color: bloque.done ? COLORS.muted : COLORS.text, textDecoration: bloque.done ? "line-through" : "none" }}>{bloque.tarea}</div>
                          </>
                        )}
                      </div>
                      {!isEditing && (
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button onClick={() => setEditingBlock({ diaIdx, bloqueIdx })}
                            style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 5, color: COLORS.muted, fontSize: 11, padding: "2px 6px", cursor: "pointer" }}>✎</button>
                          <button onClick={() => onDeleteBloque(diaIdx, bloqueIdx)}
                            style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 5, color: COLORS.red, fontSize: 11, padding: "2px 6px", cursor: "pointer" }}>✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WEEK VIEW ─────────────────────────────────────────────────────────────────
function WeekView({ agenda }) {
  if (!agenda) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: COLORS.muted }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
      <div style={{ fontSize: 15 }}>Genera primero tu agenda para ver la vista de semana</div>
    </div>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(110px, 1fr))", gap: 6, minWidth: 700 }}>
        {agenda.dias?.map((day, i) => {
          const totalHours = day.bloques?.reduce((a, b) => a + (b.horas || 0), 0) || 0;
          const done = day.bloques?.filter(b => b.done).length || 0;
          return (
            <div key={i} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "8px 10px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surfaceHigh }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{day.dia.slice(0, 3).toUpperCase()}</div>
                <div style={{ fontSize: 10, color: COLORS.muted }}>{totalHours}h · {done}/{day.bloques?.length} ✓</div>
              </div>
              <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                {day.bloques?.map((bloque, j) => {
                  const dist = agenda.distribucion?.find(d => d.proyecto === bloque.proyecto);
                  const color = dist?.color || COLORS.teal;
                  return (
                    <div key={j} style={{ padding: "5px 7px", borderRadius: 5, background: `${color}18`, borderLeft: `2px solid ${color}`, opacity: bloque.done ? 0.4 : 1 }}>
                      <div style={{ fontSize: 9, color, fontWeight: 700, marginBottom: 1 }}>{bloque.proyecto}</div>
                      <div style={{ fontSize: 9, color: COLORS.textSoft, lineHeight: 1.3, textDecoration: bloque.done ? "line-through" : "none" }}>{bloque.tarea?.slice(0, 60)}{bloque.tarea?.length > 60 ? "…" : ""}</div>
                      <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 2 }}>{bloque.horas}h</div>
                    </div>
                  );
                })}
                {(!day.bloques || day.bloques.length === 0) && <div style={{ fontSize: 10, color: COLORS.muted, textAlign: "center", padding: "8px 0" }}>Descanso</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PROJECT MODAL ─────────────────────────────────────────────────────────────
function ProjectModal({ project, onSave, onClose }) {
  const [form, setForm] = useState(project || { name: "", type: "Trabajo / freelance", priority: "Alta", status: "activo", description: "", hoursPerWeek: 5 });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000AA", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28, width: "100%", maxWidth: 460 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700 }}>{project ? "Editar proyecto" : "Nuevo proyecto"}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nombre"><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="ej: App de finanzas" style={inputStyle} /></Field>
          <Field label="Tipo">
            <select value={form.type} onChange={e => set("type", e.target.value)} style={inputStyle}>
              {["Trabajo / freelance", "Negocio / emprendimiento", "Aprendizaje / estudio", "Personal / creativo"].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Prioridad">
              <select value={form.priority} onChange={e => set("priority", e.target.value)} style={inputStyle}>
                {PRIORITY_LABELS.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select value={form.status} onChange={e => set("status", e.target.value)} style={inputStyle}>
                {["activo", "en pausa", "algún día"].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Horas/sem">
              <input type="number" value={form.hoursPerWeek} onChange={e => set("hoursPerWeek", Number(e.target.value))} min={1} style={inputStyle} />
            </Field>
          </div>
          <Field label="Descripción (opcional)">
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} placeholder="¿Qué es este proyecto?" style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.muted, fontSize: 14, padding: "9px 18px", cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => form.name.trim() && onSave(form)} style={{ background: COLORS.amber, color: "#000", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, padding: "9px 22px", cursor: "pointer" }}>
            {project ? "Guardar cambios" : "Crear proyecto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>
      {children}
    </div>
  );
}
