import { useState, useEffect } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PROJECT_COLORS = [
  "#FF6B6B","#4ECDC4","#A78BFA","#FF9F43","#2ED573",
  "#45B7D1","#FD79A8","#FDCB6E","#6C5CE7","#00B894",
];

const DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const DAY_ABBR = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];

const URGENCY = {
  urgente:        { label: "Urgente",       color: "#E05252" },
  importante:     { label: "Importante",    color: "#D4860A" },
  "no importante":{ label: "No urgente",    color: "#4A90D9" },
};

const PROGRESS_STEPS = [0, 25, 50, 75, 100];

// ─── THEME ──────────────────────────────────────────────────────────────────
const T = {
  bg:        "#FAF7F2",
  panel:     "#F2EDE4",
  card:      "#FFFFFF",
  cardHover: "#FDF9F4",
  border:    "#E5DDD1",
  text:      "#2C2820",
  soft:      "#7A7060",
  muted:     "#B0A898",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function uid()    { return Math.random().toString(36).slice(2, 9); }
function today()  { return new Date().toISOString().slice(0, 10); }
function weekStart() {
  const d = new Date();
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
const emptyCalendar = () => Object.fromEntries(DAYS.map(d => [d, []]));

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [projects,    setProjects]    = useState([]);
  const [calendar,    setCalendar]    = useState(emptyCalendar());
  const [activityLog, setActivityLog] = useState([]);
  const [showAddProj, setShowAddProj] = useState(false);
  const [editProj,    setEditProj]    = useState(null);    // project object
  const [addTaskFor,  setAddTaskFor]  = useState(null);    // projectId
  const [editingTask, setEditingTask] = useState(null);    // { projectId, taskId }
  const [dragOver,    setDragOver]    = useState(null);    // day name
  const [showLog,     setShowLog]     = useState(true);

  // ── Persistence ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("semanaFoco_v3");
      if (saved) {
        const d = JSON.parse(saved);
        if (d.projects)    setProjects(d.projects);
        if (d.calendar)    setCalendar(d.calendar);
        if (d.activityLog) setActivityLog(d.activityLog);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    localStorage.setItem("semanaFoco_v3", JSON.stringify({ projects, calendar, activityLog }));
  }, [projects, calendar, activityLog]);

  // ── Live task lookup (always fresh from state) ──
  function findTask(taskId) {
    for (const proj of projects) {
      const t = proj.tasks?.find(t => t.id === taskId);
      if (t) return { task: t, project: proj };
    }
    return null;
  }

  // Live data for editing modal
  const editingLive = editingTask && (() => {
    const proj = projects.find(p => p.id === editingTask.projectId);
    const task = proj?.tasks?.find(t => t.id === editingTask.taskId);
    return proj && task ? { project: proj, task } : null;
  })();

  // ── Activity log ──
  function logActivity(task, project, action) {
    setActivityLog(l => [{
      id: uid(), taskId: task.id, projectId: project.id,
      taskText: task.text, projectName: project.name, projectColor: project.color,
      date: today(), progress: task.progress, action,
    }, ...l]);
  }

  // ── Projects ──
  function addProject(name) {
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    setProjects(p => [...p, { id: uid(), name, color, tasks: [] }]);
    setShowAddProj(false);
  }

  function saveProject(name) {
    setProjects(p => p.map(x => x.id === editProj.id ? { ...x, name } : x));
    setEditProj(null);
  }

  function deleteProject(id) {
    const proj = projects.find(p => p.id === id);
    if (proj) {
      const ids = new Set(proj.tasks.map(t => t.id));
      setCalendar(cal => Object.fromEntries(DAYS.map(d => [d, cal[d].filter(e => !ids.has(e.taskId))])));
    }
    setProjects(p => p.filter(x => x.id !== id));
  }

  // ── Tasks ──
  function addTask(projectId, data) {
    setProjects(p => p.map(x => x.id === projectId
      ? { ...x, tasks: [...(x.tasks || []), { id: uid(), progress: 0, done: false, completedAt: null, ...data }] }
      : x));
    setAddTaskFor(null);
  }

  function saveTask(projectId, taskId, data) {
    setProjects(p => p.map(x => x.id === projectId
      ? { ...x, tasks: x.tasks.map(t => t.id === taskId ? { ...t, ...data } : t) }
      : x));
    setEditingTask(null);
  }

  function deleteTask(projectId, taskId) {
    setCalendar(cal => Object.fromEntries(DAYS.map(d => [d, cal[d].filter(e => e.taskId !== taskId)])));
    setProjects(p => p.map(x => x.id === projectId
      ? { ...x, tasks: x.tasks.filter(t => t.id !== taskId) }
      : x));
  }

  function setTaskProgress(projectId, taskId, progress) {
    const found = findTask(taskId);
    if (!found) return;
    const { task, project } = found;
    const done = progress === 100;
    setProjects(p => p.map(x => x.id === projectId
      ? { ...x, tasks: x.tasks.map(t => t.id === taskId
          ? { ...t, progress, done, completedAt: done ? new Date().toISOString() : null }
          : t) }
      : x));
    if (done && !task.done) logActivity({ ...task, progress }, project, "completed");
    else if (progress > 0 && progress > (task.progress || 0) && !done)
      logActivity({ ...task, progress }, project, "progress_update");
  }

  function toggleTaskDone(projectId, taskId) {
    const found = findTask(taskId);
    if (!found) return;
    const { task, project } = found;
    const newDone = !task.done;
    const progress = newDone ? 100 : task.progress === 100 ? 75 : (task.progress || 0);
    setProjects(p => p.map(x => x.id === projectId
      ? { ...x, tasks: x.tasks.map(t => t.id === taskId
          ? { ...t, done: newDone, progress, completedAt: newDone ? new Date().toISOString() : null }
          : t) }
      : x));
    if (newDone) logActivity({ ...task, progress: 100 }, project, "completed");
  }

  // ── Calendar ──
  function dropOnDay(day, taskId, projectId) {
    if (calendar[day]?.some(e => e.taskId === taskId)) return;
    setCalendar(cal => ({ ...cal, [day]: [...(cal[day] || []), { calId: uid(), taskId, projectId, done: false }] }));
  }

  function removeFromCal(day, calId) {
    setCalendar(cal => ({ ...cal, [day]: cal[day].filter(e => e.calId !== calId) }));
  }

  function toggleCalDone(day, calId) {
    const entry = calendar[day]?.find(e => e.calId === calId);
    if (!entry) return;
    const newDone = !entry.done;
    setCalendar(cal => ({ ...cal, [day]: cal[day].map(e => e.calId === calId ? { ...e, done: newDone } : e) }));
    if (newDone) {
      const found = findTask(entry.taskId);
      if (found && !found.task.done) setTaskProgress(entry.projectId, entry.taskId, 100);
    }
  }

  function getScheduledDays(taskId) {
    return DAYS.filter(d => calendar[d]?.some(e => e.taskId === taskId));
  }

  // ── Stats ──
  const todayStr    = today();
  const wkStart     = weekStart();
  const totalTasks  = projects.reduce((a, p) => a + (p.tasks?.length || 0), 0);
  const doneTasks   = projects.reduce((a, p) => a + (p.tasks?.filter(t => t.done).length || 0), 0);

  const todayDone = [...new Map(
    activityLog.filter(e => e.date === todayStr && e.action === "completed").map(e => [e.taskId, e])
  ).values()];

  const weekDone = [...new Map(
    activityLog.filter(e => e.date >= wkStart && e.action === "completed").map(e => [e.taskId, e])
  ).values()];

  const weekByProject = weekDone.reduce((acc, e) => {
    if (!acc[e.projectName]) acc[e.projectName] = { count: 0, color: e.projectColor };
    acc[e.projectName].count++;
    return acc;
  }, {});

  // ── Render ──
  return (
    <div style={{ background: T.bg, height: "100vh", color: T.text, fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* HEADER */}
      <header style={{ padding: "13px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>Mi Semana con Foco</div>
            <div style={{ fontSize: 11, color: T.soft }}>
              {totalTasks > 0
                ? `${doneTasks} de ${totalTasks} tareas completadas`
                : "Empieza creando un proyecto"}
            </div>
          </div>
        </div>
        <button onClick={() => setShowAddProj(true)} style={btnPrimary}>+ Nuevo proyecto</button>
      </header>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ width: 290, flexShrink: 0, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.panel }}>

          {/* Task list – scrollable */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 10px" }}>
            <div style={sectionLabel}>Proyectos y Tareas</div>

            {projects.length === 0 && (
              <div style={{ textAlign: "center", padding: "36px 12px", color: T.muted }}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>🌱</div>
                <div style={{ fontSize: 12, lineHeight: 1.6, color: T.soft }}>
                  Crea tu primer proyecto<br />y empieza a planificar
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {projects.map(project => (
                <ProjectSection
                  key={project.id}
                  project={project}
                  getScheduledDays={getScheduledDays}
                  onAddTask={() => setAddTaskFor(project.id)}
                  onEditProject={() => setEditProj(project)}
                  onDeleteProject={() => deleteProject(project.id)}
                  onEditTask={(taskId) => setEditingTask({ projectId: project.id, taskId })}
                  onDeleteTask={(taskId) => deleteTask(project.id, taskId)}
                  onToggleDone={(taskId) => toggleTaskDone(project.id, taskId)}
                  onSetProgress={(taskId, p) => setTaskProgress(project.id, taskId, p)}
                />
              ))}
            </div>
          </div>

          {/* ── MI AVANCE – fixed bottom ── */}
          <div style={{ borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            <button
              onClick={() => setShowLog(s => !s)}
              style={{ width: "100%", background: "none", border: "none", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: T.text }}
            >
              <span style={{ fontSize: 14 }}>🏆</span>
              <span style={{ fontWeight: 700, fontSize: 12, flex: 1, textAlign: "left" }}>Mi avance</span>
              <span style={{ fontSize: 10, color: T.soft }}>{showLog ? "▼" : "▶"}</span>
            </button>

            {showLog && (
              <div style={{ padding: "0 14px 14px", maxHeight: 230, overflowY: "auto" }}>

                {/* Today */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ ...sectionLabel, marginBottom: 7 }}>
                    Hoy — {todayDone.length} {todayDone.length === 1 ? "completada" : "completadas"}
                  </div>
                  {todayDone.length === 0
                    ? <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic" }}>¡Vamos! El primer ✓ está esperando 💪</div>
                    : todayDone.map(e => (
                        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: e.projectColor, flexShrink: 0 }} />
                          <div style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.taskText}</div>
                        </div>
                      ))
                  }
                </div>

                {/* This week */}
                <div>
                  <div style={{ ...sectionLabel, marginBottom: 7 }}>
                    Esta semana — {weekDone.length} {weekDone.length === 1 ? "completada" : "completadas"}
                  </div>
                  {weekDone.length === 0
                    ? <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic" }}>Aquí verás tu progreso</div>
                    : Object.entries(weekByProject).map(([name, { count, color }]) => (
                        <div key={name} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          <div style={{ fontSize: 11, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                          <div style={{ fontSize: 10, color: color, fontWeight: 700, flexShrink: 0 }}>{count} ✓</div>
                        </div>
                      ))
                  }
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL – Calendar ── */}
        <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", padding: "14px 14px", background: T.bg }}>
          <div style={sectionLabel}>Semana — arrastra las tareas aquí</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(130px, 1fr))", gap: 8, minWidth: 910 }}>
            {DAYS.map((day, i) => (
              <DayColumn
                key={day}
                day={day}
                dayAbbr={DAY_ABBR[i]}
                entries={calendar[day] || []}
                isDragOver={dragOver === day}
                onDragOver={e => { e.preventDefault(); setDragOver(day); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(null);
                  const taskId    = e.dataTransfer.getData("taskId");
                  const projectId = e.dataTransfer.getData("projectId");
                  if (taskId && projectId) dropOnDay(day, taskId, projectId);
                }}
                findTask={findTask}
                onRemove={calId => removeFromCal(day, calId)}
                onToggleDone={calId => toggleCalDone(day, calId)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}
      {showAddProj && (
        <ProjectModal onSave={addProject} onClose={() => setShowAddProj(false)} />
      )}
      {editProj && (
        <ProjectModal project={editProj} onSave={saveProject} onClose={() => setEditProj(null)} />
      )}
      {addTaskFor && (
        <TaskModal onSave={data => addTask(addTaskFor, data)} onClose={() => setAddTaskFor(null)} />
      )}
      {editingTask && editingLive && (
        <TaskModal
          task={editingLive.task}
          onSave={data => saveTask(editingTask.projectId, editingTask.taskId, data)}
          onClose={() => setEditingTask(null)}
          onSetProgress={p => setTaskProgress(editingTask.projectId, editingTask.taskId, p)}
        />
      )}
    </div>
  );
}

// ─── PROJECT SECTION ─────────────────────────────────────────────────────────
function ProjectSection({ project, getScheduledDays, onAddTask, onEditProject, onDeleteProject, onEditTask, onDeleteTask, onToggleDone, onSetProgress }) {
  const [collapsed, setCollapsed] = useState(false);
  const pending = project.tasks?.filter(t => !t.done).length || 0;
  const urgencyOrder = { urgente: 0, importante: 1, "no importante": 2 };
  const sorted = [...(project.tasks || [])].sort((a, b) => (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2));

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}` }}>
      {/* Header */}
      <div style={{ padding: "9px 10px", background: T.card, display: "flex", alignItems: "center", gap: 7, borderLeft: `3px solid ${project.color}` }}>
        <button onClick={() => setCollapsed(c => !c)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 10, padding: 0, lineHeight: 1 }}>
          {collapsed ? "▶" : "▼"}
        </button>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</div>
        <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>{pending}</span>
        <button onClick={onAddTask} style={{ background: `${project.color}20`, border: `1px solid ${project.color}40`, borderRadius: 5, color: project.color, fontSize: 11, fontWeight: 700, padding: "1px 7px", cursor: "pointer" }}>+</button>
        <button onClick={onEditProject} style={{ background: "none", border: "none", color: T.muted, fontSize: 10, cursor: "pointer", padding: "1px 3px" }}>✎</button>
        <button onClick={onDeleteProject} style={{ background: "none", border: "none", color: "#FF6B6B55", fontSize: 10, cursor: "pointer", padding: "1px 3px" }}>✕</button>
      </div>

      {!collapsed && (
        <div style={{ background: T.panel }}>
          {sorted.length === 0 && (
            <div style={{ padding: "11px 12px", fontSize: 11, color: T.muted, textAlign: "center" }}>
              Presiona + para agregar tareas
            </div>
          )}
          {sorted.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              project={project}
              scheduledDays={getScheduledDays(task.id)}
              onEdit={() => onEditTask(task.id)}
              onDelete={() => onDeleteTask(task.id)}
              onToggleDone={() => onToggleDone(task.id)}
              onSetProgress={p => onSetProgress(task.id, p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TASK CARD ────────────────────────────────────────────────────────────────
function TaskCard({ task, project, scheduledDays, onEdit, onDelete, onToggleDone, onSetProgress }) {
  const urg = URGENCY[task.urgency] || URGENCY["no importante"];
  const progress = task.progress || 0;

  function advanceProgress(e) {
    e.stopPropagation();
    const idx = PROGRESS_STEPS.indexOf(progress);
    const next = PROGRESS_STEPS[Math.min(idx + 1, PROGRESS_STEPS.length - 1)];
    if (next !== progress) onSetProgress(next);
  }

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData("taskId",    task.id);
        e.dataTransfer.setData("projectId", project.id);
      }}
      style={{ borderLeft: `3px solid ${project.color}`, background: T.card, opacity: task.done ? 0.5 : 1, cursor: "grab", userSelect: "none" }}
      onMouseEnter={e => !task.done && (e.currentTarget.style.background = T.cardHover)}
      onMouseLeave={e => (e.currentTarget.style.background = T.card)}
    >
      <div style={{ padding: "8px 10px", display: "flex", alignItems: "flex-start", gap: 7 }}>
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={task.done}
          onChange={onToggleDone}
          onClick={e => e.stopPropagation()}
          style={{ accentColor: project.color, flexShrink: 0, marginTop: 2, width: 13, height: 13 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: task.done ? T.muted : T.text, textDecoration: task.done ? "line-through" : "none", lineHeight: 1.4, marginBottom: 4 }}>
            {task.text}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: urg.color, background: `${urg.color}18`, borderRadius: 4, padding: "1px 5px" }}>
              {urg.label}
            </span>
            {task.estimatedTime && (
              <span style={{ fontSize: 9, color: T.soft }}>⏱ {task.estimatedTime}h</span>
            )}
            {scheduledDays.map(day => (
              <span key={day} style={{ fontSize: 9, color: project.color, background: `${project.color}18`, borderRadius: 3, padding: "1px 4px", fontWeight: 600 }}>
                {day.slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
          <button onClick={onEdit}   style={{ background: "none", border: "none", color: T.muted, fontSize: 10, cursor: "pointer", padding: "2px 3px" }}>✎</button>
          <button onClick={onDelete} style={{ background: "none", border: "none", color: "#FF6B6B44", fontSize: 10, cursor: "pointer", padding: "2px 3px" }}>✕</button>
        </div>
      </div>

      {/* Progress bar — click to advance */}
      {!task.done && (
        <div
          onClick={advanceProgress}
          title={`Avance: ${progress}% — clic para avanzar`}
          style={{ height: 4, background: T.border, cursor: "pointer", margin: "0 0 0 0" }}
        >
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${project.color}88, ${project.color})`,
            borderRadius: "0 2px 2px 0",
            transition: "width 0.3s ease",
          }} />
        </div>
      )}
      {!task.done && progress > 0 && (
        <div style={{ textAlign: "right", fontSize: 9, color: T.muted, padding: "2px 8px 4px", lineHeight: 1 }}>
          {progress}%
        </div>
      )}
    </div>
  );
}

// ─── DAY COLUMN ──────────────────────────────────────────────────────────────
function DayColumn({ day, dayAbbr, entries, isDragOver, onDragOver, onDragLeave, onDrop, findTask, onRemove, onToggleDone }) {
  const done  = entries.filter(e => e.done).length;
  const total = entries.length;

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        borderRadius: 10,
        border: isDragOver ? `2px dashed #A78BFA` : `1px solid ${T.border}`,
        background: isDragOver ? "#A78BFA18" : T.panel,
        minHeight: 200,
        transition: "all 0.15s",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Day header */}
      <div style={{ padding: "9px 10px", borderBottom: `1px solid ${T.border}`, background: T.card, borderRadius: "9px 9px 0 0" }}>
        <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: "0.06em", color: T.text }}>{dayAbbr}</div>
        <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>
          {total === 0 ? "libre" : `${done}/${total} ✓`}
        </div>
      </div>

      {/* Entries */}
      <div style={{ padding: "7px 6px", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
        {entries.map(entry => {
          const found = findTask(entry.taskId);
          if (!found) return null;
          return (
            <CalendarTask
              key={entry.calId}
              entry={entry}
              task={found.task}
              project={found.project}
              onRemove={() => onRemove(entry.calId)}
              onToggleDone={() => onToggleDone(entry.calId)}
            />
          );
        })}
        {total === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: T.muted, fontSize: 10, opacity: 0.6 }}>
            Suelta aquí
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CALENDAR TASK ────────────────────────────────────────────────────────────
function CalendarTask({ entry, task, project, onRemove, onToggleDone }) {
  const progress = task.progress || 0;
  return (
    <div style={{ borderRadius: 7, background: `${project.color}15`, border: `1px solid ${project.color}30`, padding: "7px 8px", position: "relative", opacity: entry.done ? 0.45 : 1, transition: "opacity 0.2s" }}>
      <button onClick={onRemove} style={{ position: "absolute", top: 3, right: 3, background: "none", border: "none", color: T.muted, fontSize: 9, cursor: "pointer", padding: "1px 3px", lineHeight: 1 }}>✕</button>
      <div style={{ paddingRight: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: project.color, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {project.name}
        </div>
        <div
          onClick={onToggleDone}
          style={{ fontSize: 11, color: entry.done ? T.muted : T.text, textDecoration: entry.done ? "line-through" : "none", cursor: "pointer", lineHeight: 1.4 }}
        >
          {task.text}
        </div>
        {task.estimatedTime && (
          <div style={{ fontSize: 9, color: T.soft, marginTop: 3 }}>⏱ {task.estimatedTime}h</div>
        )}
        {progress > 0 && progress < 100 && (
          <div style={{ marginTop: 5, height: 2, background: T.border, borderRadius: 1 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: project.color }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PROJECT MODAL ────────────────────────────────────────────────────────────
function ProjectModal({ project, onSave, onClose }) {
  const [name, setName] = useState(project?.name || "");
  return (
    <Modal title={project ? "Editar proyecto" : "Nuevo proyecto"} onClose={onClose}>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && name.trim() && onSave(name.trim())}
        placeholder="ej: App de finanzas"
        autoFocus
        style={{ ...inputSt, marginBottom: 16 }}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnSec}>Cancelar</button>
        <button onClick={() => name.trim() && onSave(name.trim())} style={btnPrimary}>
          {project ? "Guardar" : "Crear proyecto"}
        </button>
      </div>
    </Modal>
  );
}

// ─── TASK MODAL ──────────────────────────────────────────────────────────────
function TaskModal({ task, onSave, onClose, onSetProgress }) {
  const [form, setForm] = useState({
    text:          task?.text          || "",
    urgency:       task?.urgency       || "importante",
    estimatedTime: task?.estimatedTime || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const currentProgress = task?.progress || 0;

  return (
    <Modal title={task ? "Editar tarea" : "Nueva tarea"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Text */}
        <div>
          <label style={labelSt}>¿Qué hay que hacer?</label>
          <input value={form.text} onChange={e => set("text", e.target.value)} placeholder="Descripción de la tarea" autoFocus style={inputSt} />
        </div>

        {/* Urgency */}
        <div>
          <label style={labelSt}>Nivel de urgencia</label>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(URGENCY).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => set("urgency", key)}
                style={{
                  flex: 1, padding: "7px 4px", borderRadius: 7, cursor: "pointer", transition: "all 0.15s",
                  border:      form.urgency === key ? `2px solid ${cfg.color}` : `1px solid ${T.border}`,
                  background:  form.urgency === key ? `${cfg.color}18`         : T.card,
                  color:       form.urgency === key ? cfg.color                 : T.soft,
                  fontSize: 10, fontWeight: form.urgency === key ? 700 : 400,
                }}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div>
          <label style={labelSt}>Tiempo estimado (horas, opcional)</label>
          <input
            type="number" min={0.5} step={0.5}
            value={form.estimatedTime}
            onChange={e => set("estimatedTime", e.target.value ? Number(e.target.value) : "")}
            placeholder="ej: 1.5"
            style={{ ...inputSt, width: 120 }}
          />
        </div>

        {/* Progress (only when editing) */}
        {task && onSetProgress && (
          <div>
            <label style={labelSt}>Marcar avance — {currentProgress}% completada</label>
            <div style={{ display: "flex", gap: 5 }}>
              {PROGRESS_STEPS.map(p => (
                <button
                  key={p}
                  onClick={() => onSetProgress(p)}
                  style={{
                    flex: 1, padding: "7px 2px", borderRadius: 7, cursor: "pointer", transition: "all 0.15s",
                    border:     currentProgress === p ? `2px solid #A78BFA` : `1px solid ${T.border}`,
                    background: currentProgress === p ? "#A78BFA20"          : T.card,
                    color:      currentProgress === p ? "#A78BFA"            : T.soft,
                    fontSize: 10, fontWeight: currentProgress === p ? 700 : 400,
                  }}
                >
                  {p === 100 ? "✓ Listo" : `${p}%`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={onClose} style={btnSec}>Cancelar</button>
          <button onClick={() => form.text.trim() && onSave({ text: form.text.trim(), urgency: form.urgency, estimatedTime: form.estimatedTime || null })} style={btnPrimary}>
            {task ? "Guardar cambios" : "Agregar tarea"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODAL WRAPPER ────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#2C282055", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 22, width: "100%", maxWidth: 400, boxShadow: "0 24px 64px #00000077" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const inputSt = {
  width: "100%", background: T.panel, border: `1px solid ${T.border}`,
  borderRadius: 8, color: T.text, fontSize: 13, padding: "9px 12px",
  boxSizing: "border-box", outline: "none", display: "block",
};
const btnPrimary = {
  background: "linear-gradient(135deg, #A78BFA, #818CF8)", border: "none",
  borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700,
  padding: "8px 18px", cursor: "pointer",
};
const btnSec = {
  background: "none", border: `1px solid ${T.border}`,
  borderRadius: 8, color: T.soft, fontSize: 13, padding: "8px 14px", cursor: "pointer",
};
const labelSt = {
  fontSize: 10, color: T.muted, display: "block", marginBottom: 6,
  textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
};
const sectionLabel = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.muted,
  textTransform: "uppercase", marginBottom: 12,
};
