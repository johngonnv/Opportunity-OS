import { useState } from "react";

const timeline = [
  { id:"t1", icon:"📞", type:"Call",       text:"Call with Dr. Angela Torres — EHR readiness review",         contact:"Dr. Angela Torres", sub:"3 days ago",  color:"#10b981" },
  { id:"t2", icon:"📧", type:"Email",      text:"Proposal sent to supply chain team re: device agreement",     contact:"David Reyes",       sub:"1 week ago",  color:"#3b82f6" },
  { id:"t3", icon:"🤝", type:"Meeting",    text:"Onsite exec briefing — Memorial HQ",                          contact:"Sandra Cho",         sub:"10 days ago", color:"#6366f1" },
  { id:"t4", icon:"📋", type:"Note",       text:"Site visit notes captured — Memorial Univ. Med Ctr campus",   contact:"",                  sub:"2 weeks ago", color:"#f59e0b" },
  { id:"t5", icon:"📞", type:"Call",       text:"Intro call — Dr. Rachel Kim, Oncology Medical Director",      contact:"Dr. Rachel Kim",    sub:"3 weeks ago", color:"#10b981" },
  { id:"t6", icon:"📷", type:"Eye Scan",   text:"Scanned Opportunity Eye — Memorial Health System logo",       contact:"",                  sub:"May 20, 2026", color:"#818cf8" },
];

const tasks = [
  { id:"k1", text:"Follow up with Sandra Cho on contract terms", due:"Tomorrow",   done:false, priority:"high"   },
  { id:"k2", text:"Send Epic integration spec doc to IT team",   due:"In 3 days",  done:false, priority:"medium" },
  { id:"k3", text:"Schedule quarterly review with CMO office",   due:"Next week",  done:false, priority:"low"    },
  { id:"k4", text:"Confirm NPI verification with CMS portal",    due:"Completed",  done:true,  priority:"done"   },
];

const priorityColors: Record<string,string> = { high:"#ef4444", medium:"#f59e0b", low:"#64748b", done:"#334155" };

export function OrgDetailTabActivity() {
  const [activeSection, setActiveSection] = useState<"activities"|"tasks">("activities");
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set(["k4"]));

  const toggleTask = (id: string) => setCheckedTasks(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans relative overflow-hidden">
      {/* Nav */}
      <div className="flex items-center gap-2 px-4 pt-12 pb-2 flex-shrink-0">
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1e3a5f]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-[#64748b] text-[12px]">Organizations</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        <span className="text-white text-[13px] font-semibold flex-1 truncate">Memorial Health System</span>
      </div>

      {/* Mini identity strip */}
      <div className="mx-4 mb-2 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3.5 py-2.5 flex items-center gap-3"
        style={{ borderLeftWidth: 4, borderLeftColor: "#6366f1" }}>
        <span className="text-[20px]">🏥</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-[13px] truncate">Memorial Health System</p>
          <p className="text-[#64748b] text-[10px] font-mono">NPI 1234567890 · Savannah, GA</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#10b98122] text-[#10b981]">● Active</span>
      </div>

      {/* Tab bar — Activity active */}
      <div className="flex border-b border-[#1e3a5f] px-4 flex-shrink-0">
        {["Overview","Contacts","Hierarchy","Activity"].map(t => (
          <button key={t} className="flex-1 py-2.5 text-[12px] font-semibold border-b-2 transition-all"
            style={{ borderColor: t==="Activity"?"#6366f1":"transparent", color: t==="Activity"?"#818cf8":"#475569" }}>
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pt-3 pb-24 px-4">
        {/* Quick log row */}
        <div className="flex gap-2 mb-3">
          {[{l:"+ Call",c:"#10b981"},{l:"+ Note",c:"#64748b"},{l:"+ Meeting",c:"#6366f1"},{l:"+ Task",c:"#f59e0b"}].map(a => (
            <button key={a.l} className="flex-1 py-2 rounded-xl border text-[11px] font-semibold"
              style={{ backgroundColor: a.c+"12", borderColor: a.c+"40", color: a.c }}>
              {a.l}
            </button>
          ))}
        </div>

        {/* Section toggle */}
        <div className="flex gap-1 mb-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl p-1">
          {(["activities","tasks"] as const).map(s => (
            <button key={s} onClick={() => setActiveSection(s)}
              className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold capitalize transition-all"
              style={{ backgroundColor: activeSection===s?"#6366f1":"transparent", color: activeSection===s?"white":"#64748b" }}>
              {s === "activities" ? `Activities (${timeline.length})` : `Tasks (${tasks.filter(t=>!t.done).length})`}
            </button>
          ))}
        </div>

        {activeSection === "activities" && (
          <div className="flex flex-col gap-2">
            {timeline.map(a => (
              <div key={a.id} className="flex gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl p-3.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[16px] flex-shrink-0"
                  style={{ backgroundColor: a.color+"20", border:`1px solid ${a.color}44` }}>
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-white text-[12px] font-semibold leading-snug flex-1">{a.text}</p>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: a.color+"22", color: a.color }}>{a.type}</span>
                  </div>
                  {a.contact && <p className="text-[#64748b] text-[10px] mt-1">with {a.contact}</p>}
                  <p className="text-[#334155] text-[10px] mt-0.5">{a.sub}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeSection === "tasks" && (
          <div className="flex flex-col gap-2">
            {tasks.map(t => {
              const checked = checkedTasks.has(t.id);
              const pc = priorityColors[t.priority];
              return (
                <div key={t.id} className="flex items-start gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3.5 py-3"
                  style={{ opacity: checked ? 0.5 : 1 }}>
                  <button className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ borderColor: checked?"#10b981":pc, backgroundColor: checked?"#10b981":"transparent" }}
                    onClick={() => toggleTask(t.id)}>
                    {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold ${checked?"line-through text-[#334155]":"text-white"}`}>{t.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: pc+"22", color: pc }}>
                        {t.priority}
                      </span>
                      <span className="text-[#475569] text-[10px]">{t.due}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <button className="w-full flex items-center justify-center gap-2 border border-dashed border-[#1e3a5f] rounded-2xl py-3 text-[#475569] text-[12px] mt-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Task
            </button>
          </div>
        )}
      </div>

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2 py-0.5 rounded-full border border-[#1e3a5f]">Activity Tab</span>
      </div>
    </div>
  );
}
