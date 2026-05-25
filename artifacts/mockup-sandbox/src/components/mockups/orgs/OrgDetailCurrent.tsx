import React, { useState } from "react";

const C = {
  bg: "#0a0e1a",
  surface: "#111827",
  surfaceHigh: "#1a2234",
  border: "#1e2a40",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#4b5563",
  emerald: "#10b981",
  blue: "#3b82f6",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#a855f7",
  cyan: "#06b6d4",
  white: "#ffffff",
};
const INDIGO = "#6366f1";
const INDIGO_LIGHT = "#818cf8";

const ORG = {
  name: "Mercy Regional Medical Center",
  npi: "1234567890",
  city: "Columbus",
  state: "OH",
  vertical: "healthcare",
  organizationType: "HOSPITAL",
  accountStructureType: "regional",
  accountState: "WARMING",
  tags: [
    { id: "1", name: "Key Account", color: INDIGO },
    { id: "2", name: "Q3 Priority", color: C.amber },
  ],
  parentOrg: { id: "p1", name: "Mercy Health System" },
  enrichedAt: "2026-05-20T00:00:00Z",
  createdAt: "2026-05-10T00:00:00Z",
};

const CONTACTS = [
  { id: "c1", fullName: "Dr. Sarah Mitchell", title: "Chief Medical Officer", strength: 72, dept: "Executive" },
  { id: "c2", fullName: "James Thornton", title: "VP of Supply Chain", strength: 45, dept: "Procurement" },
  { id: "c3", fullName: "Linda Park", title: "Director of Clinical IT", strength: 28, dept: "IT/Tech" },
];

const OPPS = [
  { id: "o1", title: "EHR Integration Suite", stage: "Proposal", prob: 60, value: 185000 },
  { id: "o2", title: "Supply Chain Pilot", stage: "Discovery", prob: 30, value: 42000 },
];

const ACTIVITIES = [
  { id: "a1", type: "MEETING", subject: "Q2 strategy review with Dr. Mitchell", occurred: "2026-05-22" },
  { id: "a2", type: "EMAIL", subject: "Proposal follow-up — EHR Integration", occurred: "2026-05-18" },
  { id: "a3", type: "CALL", subject: "Intro call with James Thornton", occurred: "2026-05-14" },
];

const CHILDREN = [
  { id: "ch1", name: "Mercy West Campus", structure: "local_entity", contacts: 2, deals: 0 },
  { id: "ch2", name: "Mercy Outpatient Pavilion", structure: "local_entity", contacts: 1, deals: 1 },
  { id: "ch3", name: "Mercy Urgent Care — Dublin", structure: "local_entity", contacts: 0, deals: 0 },
];

const TASKS = [
  { id: "t1", title: "Send updated proposal", priority: "HIGH", due: "2026-05-28", done: false },
  { id: "t2", title: "Schedule site visit", priority: "MEDIUM", due: "2026-06-05", done: false },
  { id: "t3", title: "Brief internal team", priority: "LOW", due: "2026-06-10", done: true },
];

type Tab = "overview" | "contacts" | "hierarchy" | "activity";

function formatCurrency(v: number) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

function strengthLabel(s: number) {
  if (s >= 70) return { label: "HOT", color: C.emerald };
  if (s >= 35) return { label: "WARM", color: C.amber };
  return { label: "COLD", color: C.textDim };
}

function initials(name: string) {
  const p = name.trim().split(" ");
  return ((p[0]?.[0] || "") + (p[p.length - 1]?.[0] || "")).toUpperCase();
}

const DEPT_COLORS: Record<string, string> = {
  Executive: INDIGO, Clinical: C.amber, "IT/Tech": C.blue,
  Procurement: C.emerald, Nursing: C.purple, Operations: C.cyan,
};

const STRUCT_COLORS: Record<string, string> = {
  enterprise: INDIGO, parent: C.emerald, regional: C.blue,
  local_entity: C.textDim, local: C.textDim,
};

const STRUCT_LABELS: Record<string, string> = {
  enterprise: "Enterprise", parent: "Parent", regional: "Regional",
  local_entity: "Local Entity", local: "Local",
};

const ACT_EMOJI: Record<string, string> = {
  CALL: "📞", EMAIL: "📧", MEETING: "🤝", NOTE: "📋", FOLLOW_UP: "📌", EVENT: "⭐",
};

const PRIORITY_COLORS: Record<string, string> = { HIGH: C.red, MEDIUM: C.amber, LOW: C.textDim };

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
      color, background: color + "22", border: `1px solid ${color}44`,
      borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function Pill({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <button style={{
      display: "flex", alignItems: "center", gap: 5,
      background: color + "10", border: `1px solid ${color}44`,
      borderRadius: 20, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
    </button>
  );
}

function SectionHead({ title, action, actionColor = INDIGO_LIGHT }: { title: string; action?: string; actionColor?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 8px" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{title}</span>
      {action && <span style={{ fontSize: 12, color: actionColor, fontWeight: 600 }}>{action}</span>}
    </div>
  );
}

function OverviewTab() {
  const [deepOpen, setDeepOpen] = useState(false);

  return (
    <div>
      {/* Primary Action */}
      <div style={{
        background: `linear-gradient(135deg, ${INDIGO}18, ${INDIGO_LIGHT}0a)`,
        border: `1px solid ${INDIGO}33`, borderRadius: 12, padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 12, marginBottom: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: INDIGO + "30",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
        }}>📅</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Schedule a Meeting</div>
          <div style={{ fontSize: 11, color: INDIGO_LIGHT, marginTop: 2 }}>Account warming — engage stakeholders now</div>
        </div>
        <span style={{ fontSize: 18, color: INDIGO_LIGHT }}>›</span>
      </div>

      {/* Healthcare Intel tile */}
      <div style={{
        background: C.surface, border: `1px solid ${C.emerald}33`,
        borderRadius: 10, padding: "10px 14px", marginBottom: 10,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 14 }}>🏥</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.emerald }}>Healthcare Intel Available</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>CMS ratings · competitor data · entry strategy</div>
        </div>
        <span style={{ fontSize: 14, color: C.textDim }}>›</span>
      </div>

      {/* Pre-Visit Brief */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "10px 14px", marginBottom: 12,
        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: INDIGO + "20",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
        }}>📄</div>
        <span style={{ fontSize: 13, color: INDIGO_LIGHT, flex: 1, fontWeight: 500 }}>Generate Pre-Visit Brief</span>
        <span style={{ fontSize: 14, color: INDIGO_LIGHT }}>›</span>
      </div>

      {/* Tags */}
      <SectionHead title="Tags" action="+ Add" />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 12 }}>
        {ORG.tags.map(tag => (
          <div key={tag.id} style={{
            display: "flex", alignItems: "center", gap: 5,
            background: tag.color + "18", border: `1px solid ${tag.color}55`,
            borderRadius: 6, padding: "3px 8px",
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: tag.color }}>{tag.name}</span>
            <span style={{ fontSize: 10, color: tag.color, cursor: "pointer" }}>×</span>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <SectionHead title={`Pipeline (${OPPS.length})`} action="+ New Opp" actionColor={C.blue} />
      {OPPS.map(opp => (
        <div key={opp.id} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 3, height: 36, borderRadius: 2, background: C.blue, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{opp.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>{opp.stage}</span>
              <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 2, maxWidth: 80 }}>
                <div style={{ width: `${opp.prob}%`, height: "100%", background: C.blue, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, color: C.blue }}>{opp.prob}%</span>
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{formatCurrency(opp.value)}</span>
        </div>
      ))}

      {/* Recent Activity */}
      <SectionHead title="Recent Activity" action="See all" actionColor={INDIGO_LIGHT} />
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        {ACTIVITIES.slice(0, 2).map((a, i) => (
          <div key={a.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderTop: i > 0 ? `1px solid ${C.border}` : "none",
          }}>
            <span style={{ fontSize: 15 }}>{ACT_EMOJI[a.type] || "📌"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.text }}>{a.subject}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                {new Date(a.occurred).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Account Intelligence */}
      <SectionHead title="Account Intelligence" />
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
          {[
            { label: "Health", val: 68, color: C.emerald, display: "68%" },
            { label: "Risk", val: 32, color: C.blue, display: "Low" },
          ].map(b => (
            <div key={b.label} style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: C.textMuted }}>{b.label}</span>
                <span style={{ fontSize: 11, color: b.color, fontWeight: 600 }}>{b.display}</span>
              </div>
              <div style={{ height: 5, background: C.border, borderRadius: 3 }}>
                <div style={{ width: `${b.val}%`, height: "100%", background: b.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.amber }}>2</span>
            <span style={{ fontSize: 10, color: C.textDim }}>Gaps</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10 }}>📅</span>
          <span style={{ fontSize: 11, color: C.textDim }}>Added May 10, 2026</span>
          <span style={{ marginLeft: 8, fontSize: 10 }}>👁</span>
          <span style={{ fontSize: 11, color: INDIGO_LIGHT }}>via Opportunity Eye</span>
        </div>
      </div>

      {/* Deep Intel accordion */}
      <button onClick={() => setDeepOpen(v => !v)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: deepOpen ? "10px 10px 0 0" : 10,
        padding: "12px 14px", cursor: "pointer", marginBottom: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Healthcare Deep Intel</span>
        <span style={{ fontSize: 13, color: C.textDim }}>{deepOpen ? "▲" : "▼"}</span>
      </button>
      {deepOpen && (
        <div style={{
          background: C.surfaceHigh, border: `1px solid ${C.border}`, borderTop: "none",
          borderRadius: "0 0 10px 10px", padding: "12px 14px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            CMS star ratings, competitor landscape, pain points, and entry strategy cards appear here.
          </div>
        </div>
      )}
    </div>
  );
}

function ContactsTab() {
  const [filter, setFilter] = useState("All");
  const depts = ["All", ...Array.from(new Set(CONTACTS.map(c => c.dept)))];
  const filtered = filter === "All" ? CONTACTS : CONTACTS.filter(c => c.dept === filter);

  return (
    <div>
      {/* Scan prompt */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, background: INDIGO + "12",
        border: `1px solid ${INDIGO}33`, borderRadius: 10, padding: "10px 12px", marginBottom: 12,
      }}>
        <span style={{ fontSize: 13 }}>👁</span>
        <span style={{ fontSize: 12, color: INDIGO_LIGHT, flex: 1 }}>Scan a business card into this org</span>
        <button style={{
          background: INDIGO, color: C.white, border: "none", borderRadius: 6,
          padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>Scan</button>
      </div>

      {/* Dept filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" as const }}>
        {depts.map(d => (
          <button key={d} onClick={() => setFilter(d)} style={{
            background: filter === d ? INDIGO : "transparent",
            border: `1px solid ${filter === d ? INDIGO : C.border}`,
            borderRadius: 20, padding: "4px 12px", fontSize: 12,
            color: filter === d ? C.white : C.textMuted, cursor: "pointer", whiteSpace: "nowrap" as const,
          }}>{d}</button>
        ))}
      </div>

      {/* Contact cards */}
      {filtered.map(c => {
        const str = strengthLabel(c.strength);
        const dc = DEPT_COLORS[c.dept] || C.textMuted;
        return (
          <div key={c.id} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 20, background: str.color + "28",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: str.color, flexShrink: 0,
            }}>{initials(c.fullName)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.fullName}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{c.title}</div>
              <div style={{
                display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 600,
                color: dc, background: dc + "22", borderRadius: 4, padding: "1px 6px",
              }}>{c.dept}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 6 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: str.color,
                background: str.color + "22", borderRadius: 4, padding: "2px 7px",
              }}>{str.label}</div>
              <span style={{ fontSize: 16, color: C.textDim }}>›</span>
            </div>
          </div>
        );
      })}

      {/* Coverage gap */}
      <div style={{
        background: C.amber + "12", border: `1px solid ${C.amber}44`, borderRadius: 10,
        padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginTop: 4,
      }}>
        <span style={{ fontSize: 14 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.amber }}>Coverage Gap</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>No Nursing or Finance contacts linked yet</div>
        </div>
        <button style={{
          background: C.amber, color: C.bg, border: "none",
          borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>Add</button>
      </div>
    </div>
  );
}

function HierarchyTab() {
  return (
    <div>
      {/* Parent */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 14, color: C.blue }}>↑</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Parent Organization</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>{ORG.parentOrg.name}</div>
        </div>
        <span style={{ fontSize: 14, color: C.textDim }}>›</span>
      </div>

      <SectionHead title={`Facilities (${CHILDREN.length})`} />
      {CHILDREN.map(ch => {
        const sc = STRUCT_COLORS[ch.structure] || C.textDim;
        return (
          <div key={ch.id} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ width: 3, height: 30, borderRadius: 2, background: sc, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{ch.name}</div>
              <div style={{ fontSize: 11, color: sc, marginTop: 2 }}>{STRUCT_LABELS[ch.structure]}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {ch.contacts > 0 && <span style={{ fontSize: 11, color: C.textMuted }}>👤 {ch.contacts}</span>}
              {ch.deals > 0 && <span style={{ fontSize: 11, color: C.blue }}>📊 {ch.deals}</span>}
              <span style={{ fontSize: 14, color: C.textDim }}>›</span>
            </div>
          </div>
        );
      })}

      {/* Structure scan CTA */}
      <div style={{
        background: INDIGO + "10", border: `1px dashed ${INDIGO}44`, borderRadius: 10,
        padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, marginTop: 4, cursor: "pointer",
      }}>
        <span style={{ fontSize: 14 }}>👁</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: INDIGO_LIGHT }}>Run Structure Scan</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>Discover facilities automatically with Opportunity Eye</div>
        </div>
      </div>
    </div>
  );
}

function ActivityTab() {
  return (
    <div>
      {/* Log buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { icon: "📞", label: "Call", color: C.emerald },
          { icon: "🤝", label: "Meeting", color: INDIGO },
          { icon: "📋", label: "Note", color: C.amber },
          { icon: "📌", label: "Task", color: C.purple },
        ].map(b => (
          <button key={b.label} style={{
            flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4,
            background: b.color + "12", border: `1px solid ${b.color}33`,
            borderRadius: 10, padding: "8px 4px", cursor: "pointer",
          }}>
            <span style={{ fontSize: 16 }}>{b.icon}</span>
            <span style={{ fontSize: 11, color: b.color, fontWeight: 600 }}>{b.label}</span>
          </button>
        ))}
      </div>

      {/* Tasks */}
      <SectionHead title="Tasks" action="+ Add" />
      {TASKS.map(task => (
        <div key={task.id} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10,
          opacity: task.done ? 0.5 : 1,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: 4,
            border: `2px solid ${task.done ? C.emerald : PRIORITY_COLORS[task.priority]}`,
            background: task.done ? C.emerald + "30" : "transparent", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {task.done && <span style={{ fontSize: 10, color: C.emerald }}>✓</span>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 13, color: task.done ? C.textDim : C.text,
              textDecoration: task.done ? "line-through" : "none",
            }}>{task.title}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              Due {new Date(task.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLORS[task.priority] }}>{task.priority}</div>
        </div>
      ))}

      {/* Full Activity log */}
      <SectionHead title="Activity Log" />
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        {ACTIVITIES.map((a, i) => (
          <div key={a.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderTop: i > 0 ? `1px solid ${C.border}` : "none",
          }}>
            <span style={{ fontSize: 16 }}>{ACT_EMOJI[a.type] || "📌"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.text }}>{a.subject}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                {new Date(a.occurred).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "hierarchy", label: "Hierarchy" },
  { id: "activity", label: "Activity" },
];

export default function OrgDetailCurrent() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [fabOpen, setFabOpen] = useState(false);

  const pipelineVal = OPPS.reduce((a, o) => a + o.value, 0);
  const tabIdx = TABS.findIndex(t => t.id === activeTab);

  return (
    <div style={{
      width: 390, height: 844, background: C.bg, color: C.text,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "flex", flexDirection: "column" as const, position: "relative" as const,
      overflow: "hidden", borderRadius: 12,
    }}>
      {/* Status bar */}
      <div style={{
        height: 44, background: C.bg, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 20px", flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>9:41</span>
        <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
          <span>●●●</span><span>WiFi</span><span>🔋</span>
        </div>
      </div>

      {/* Nav bar */}
      <div style={{
        height: 44, display: "flex", alignItems: "center", padding: "0 12px",
        borderBottom: `1px solid ${C.border}`, gap: 8, flexShrink: 0,
      }}>
        <button style={{ background: "none", border: "none", cursor: "pointer", color: INDIGO_LIGHT, fontSize: 20, lineHeight: 1 }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.text, flex: 1 }}>Mercy Regional Medical</span>
        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>🗑</button>
      </div>

      {/* Identity card */}
      <div style={{
        background: C.surfaceHigh, borderLeft: `4px solid ${C.amber}`,
        padding: "12px 14px 0", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
          {/* Org icon */}
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: C.amber + "20",
            border: `1px solid ${C.amber}40`, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 22, flexShrink: 0,
          }}>🏥</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name row */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" as const }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Mercy Regional Medical Center</span>
              <div style={{
                display: "flex", alignItems: "center", gap: 3,
                background: INDIGO + "18", border: `1px solid ${INDIGO}44`,
                borderRadius: 4, padding: "1px 5px",
              }}>
                <span style={{ fontSize: 9 }}>👁</span>
                <span style={{ fontSize: 9, color: INDIGO_LIGHT }}>Eye · May 20</span>
              </div>
            </div>
            {/* NPI / location */}
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 6 }}>
              NPI 1234567890 · Columbus, OH
            </div>
            {/* Badges */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
              <Badge label="Hospital" color={C.amber} />
              <Badge label="Regional" color={C.blue} />
              <Badge label="Healthcare" color={C.emerald} />
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                background: C.amber + "22", border: `1px solid ${C.amber}44`,
                borderRadius: 4, padding: "1px 6px",
              }}>
                <div style={{ width: 5, height: 5, borderRadius: 3, background: C.amber }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: C.amber }}>Warming</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4-col stat strip */}
        <div style={{ display: "flex", borderTop: `1px solid ${C.border}` }}>
          {[
            { val: CONTACTS.length, label: "Contacts", color: C.textMuted },
            { val: CHILDREN.length, label: "Facilities", color: INDIGO },
            { val: OPPS.length, label: "Deals", color: C.blue },
            { val: formatCurrency(pipelineVal), label: "Pipeline", color: C.amber },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <div style={{ width: 1, background: C.border, margin: "8px 0" }} />}
              <div style={{ flex: 1, padding: "8px 4px", textAlign: "center" as const }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{s.label}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Quick action pills */}
      <div style={{
        display: "flex", gap: 8, padding: "8px 14px", overflowX: "auto" as const,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <Pill icon="✏️" label="Edit" color={C.emerald} />
        <Pill icon="👁" label="Opp Eye" color={INDIGO_LIGHT} />
        <Pill icon="📄" label="Opp Event" color={C.purple} />
        <Pill icon="↑" label="Mercy Health System" color={C.blue} />
        <Pill icon="↗" label="Share" color={C.textMuted} />
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", borderBottom: `1px solid ${C.border}`,
        position: "relative" as const, flexShrink: 0, background: C.bg,
      }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: "10px 0", background: "none", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
            color: activeTab === tab.id ? C.text : C.textDim,
          }}>{tab.label}</button>
        ))}
        {/* Animated indicator */}
        <div style={{
          position: "absolute" as const, bottom: 0, height: 2, background: INDIGO,
          borderRadius: 1, width: `${100 / TABS.length}%`,
          left: `${(tabIdx / TABS.length) * 100}%`,
          transition: "left 0.22s ease",
        }} />
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto" as const, padding: "12px 14px 90px" }}>
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "contacts" && <ContactsTab />}
        {activeTab === "hierarchy" && <HierarchyTab />}
        {activeTab === "activity" && <ActivityTab />}
      </div>

      {/* FAB options */}
      {fabOpen && (
        <div style={{
          position: "absolute" as const, bottom: 80, right: 16,
          display: "flex", flexDirection: "column" as const, gap: 10, alignItems: "flex-end",
        }}>
          {[
            { icon: "👤", label: "Add Contact Manually", color: C.emerald },
            { icon: "👁", label: "Scan Card into this Org", color: INDIGO },
            { icon: "📄", label: "Log Opportunity Event", color: C.purple },
          ].map(o => (
            <div key={o.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                background: C.surfaceHigh, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "5px 10px",
              }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>{o.label}</span>
              </div>
              <button style={{
                width: 40, height: 40, borderRadius: 20, background: o.color, border: "none",
                cursor: "pointer", fontSize: 16, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>{o.icon}</button>
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setFabOpen(v => !v)} style={{
        position: "absolute" as const, bottom: 20, right: 16,
        width: 52, height: 52, borderRadius: 26,
        background: fabOpen ? C.red : INDIGO, border: "none",
        cursor: "pointer", fontSize: 24, color: C.white,
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{fabOpen ? "×" : "+"}</button>
    </div>
  );
}
