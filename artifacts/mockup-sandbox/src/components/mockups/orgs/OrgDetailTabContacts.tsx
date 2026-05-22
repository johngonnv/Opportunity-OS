import { useState } from "react";

const org = {
  name: "Memorial Health System",
  npi: "1234567890",
  typeColor: "#6366f1",
  stateColor: "#10b981", stateLabel: "Active",
  phone: "+1 (912) 350-8000",
  city: "Savannah", stateAbbr: "GA",
  viaEye: true, scanDate: "May 20, 2026",
  contacts: [
    { id:"c1", name:"Dr. Angela Torres", title:"Chief Medical Officer",   dept:"Executive",   strength:"WARM", strengthColor:"#f59e0b", viaEye:true  },
    { id:"c2", name:"Sandra Cho",        title:"Chief Operating Officer", dept:"Executive",   strength:"HOT",  strengthColor:"#10b981", viaEye:false },
    { id:"c3", name:"David Reyes",       title:"Dir. Supply Chain",       dept:"Procurement", strength:"COLD", strengthColor:"#64748b", viaEye:true  },
    { id:"c4", name:"Dr. Rachel Kim",    title:"Medical Director, Onco.", dept:"Clinical",    strength:"WARM", strengthColor:"#f59e0b", viaEye:true  },
    { id:"c5", name:"Lisa Harmon RN",    title:"Chief Nursing Officer",   dept:"Nursing",     strength:"WARM", strengthColor:"#f59e0b", viaEye:false },
  ],
};

const deptColors: Record<string,string> = {
  Executive:"#6366f1", Procurement:"#10b981", Clinical:"#f59e0b", Nursing:"#3b82f6",
};

export function OrgDetailTabContacts() {
  const [longPressed, setLongPressed] = useState<string|null>(null);

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans relative overflow-hidden">
      {/* Nav */}
      <div className="flex items-center gap-2 px-4 pt-12 pb-2 flex-shrink-0">
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1e3a5f]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-[#64748b] text-[12px]">Organizations</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        <span className="text-white text-[13px] font-semibold flex-1 truncate">{org.name}</span>
      </div>

      {/* Mini identity strip */}
      <div className="mx-4 mb-2 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3.5 py-2.5 flex items-center gap-3"
        style={{ borderLeftWidth: 4, borderLeftColor: org.typeColor }}>
        <span className="text-[20px]">🏥</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-[13px] truncate">{org.name}</p>
          <p className="text-[#64748b] text-[10px] font-mono">NPI {org.npi} · {org.city}, {org.stateAbbr}</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: org.stateColor+"22", color: org.stateColor }}>● {org.stateLabel}</span>
      </div>

      {/* Tab bar — Contacts active */}
      <div className="flex border-b border-[#1e3a5f] px-4 flex-shrink-0">
        {["Overview","Contacts","Hierarchy","Activity"].map(t => (
          <button key={t} className="flex-1 py-2.5 text-[12px] font-semibold border-b-2 transition-all"
            style={{ borderColor: t==="Contacts"?"#6366f1":"transparent", color: t==="Contacts"?"#818cf8":"#475569" }}>
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pt-3 pb-24 px-4">
        {/* Scan prompt */}
        <div className="flex items-center gap-2.5 bg-[#6366f112] border border-[#6366f133] rounded-2xl px-3.5 py-3 mb-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <p className="text-[#818cf8] text-[12px] font-semibold flex-1">Scan a business card into this org</p>
          <button className="bg-[#6366f1] text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl">Scan</button>
        </div>

        {/* Contact filter pills */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-none">
          {["All","Executive","Procurement","Clinical","Nursing"].map((d,i) => (
            <button key={d} className="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border"
              style={{ backgroundColor: i===0?"#6366f118":"transparent", borderColor: i===0?"#6366f155":"#1e3a5f", color: i===0?"#818cf8":"#475569" }}>
              {d}
            </button>
          ))}
        </div>

        {/* Contacts */}
        {org.contacts.map(c => {
          const dc = deptColors[c.dept] || "#64748b";
          const isPressed = longPressed === c.id;
          return (
            <div key={c.id} className="mb-2 rounded-2xl border overflow-hidden"
              style={{ borderColor: isPressed ? "#6366f188":"#1e3a5f", backgroundColor: "#0d1f3a" }}>
              <div className="flex items-center gap-3 px-3.5 py-3"
                onMouseEnter={() => setLongPressed(c.id)}
                onMouseLeave={() => setLongPressed(null)}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                  style={{ backgroundColor: c.strengthColor+"28", color: c.strengthColor }}>
                  {c.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-white font-semibold text-[13px]">{c.name}</span>
                    {c.viaEye && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f125] text-[#818cf8]">
                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display:"inline",verticalAlign:"middle",marginRight:2}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        Eye
                      </span>
                    )}
                  </div>
                  <p className="text-[#64748b] text-[11px] truncate">{c.title}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: dc+"22", color: dc }}>{c.dept}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: c.strengthColor+"22", color: c.strengthColor }}>{c.strength}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
              {isPressed && (
                <div className="border-t border-[#6366f133] px-3 py-2 flex gap-2 bg-[#0a1628]">
                  {[{l:"View Profile",i:"👤",c:"#94a3b8"},{l:"Edit",i:"✏️",c:"#10b981"},{l:"Scan Card",i:"📷",c:"#6366f1"},{l:"Log Call",i:"📞",c:"#f59e0b"}].map(a => (
                    <button key={a.l} className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold"
                      style={{ backgroundColor: a.c+"18", color: a.c }}>
                      <span className="text-[15px]">{a.i}</span>{a.l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Missing coverage callout */}
        <div className="mt-1 flex items-center gap-2.5 bg-[#ef444410] border border-[#ef444430] rounded-2xl px-3.5 py-3">
          <span className="text-[18px]">⚠️</span>
          <div>
            <p className="text-[#fca5a5] text-[12px] font-semibold">Coverage Gap</p>
            <p className="text-[#64748b] text-[11px]">No IT / EHR champion on file</p>
          </div>
          <button className="ml-auto bg-[#ef4444] text-white text-[10px] font-bold px-2.5 py-1.5 rounded-xl">Add</button>
        </div>
      </div>

      {/* FAB */}
      <div className="absolute bottom-6 right-4">
        <button className="w-12 h-12 rounded-full shadow-xl bg-[#6366f1] flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2 py-0.5 rounded-full border border-[#1e3a5f]">Contacts Tab</span>
      </div>
    </div>
  );
}
