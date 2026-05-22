import { useState } from "react";

const org = {
  name: "Memorial Health System",
  npi: "1234567890",
  typeColor: "#6366f1",
  stateColor: "#10b981", stateLabel: "Active",
  city: "Savannah", stateAbbr: "GA",
  contacts: 22, opps: 3, children: [
    { name:"Memorial Univ. Med Ctr",   structure:"regional",   contacts:14, opps:1, npi:"1234000001",
      children:[
        { name:"Memorial Heart & Vascular", structure:"local", contacts:5, opps:1, npi:"1234000011" },
        { name:"Memorial Cancer Institute", structure:"local", contacts:3, opps:0, npi:"1234000012" },
      ]},
    { name:"Memorial Pediatric Hosp.", structure:"regional",   contacts:7,  opps:0, npi:"1234000002", children:[] },
    { name:"Coastal Imaging Center",   structure:"local",      contacts:3,  opps:1, npi:"1234000003", children:[] },
  ],
};

const structTierColors: Record<string,string> = {
  enterprise:"#6366f1", regional:"#3b82f6", local:"#64748b",
};

function ChildNode({ c, depth }: { c: any; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const hasKids = c.children && c.children.length > 0;
  const sc = structTierColors[c.structure] || "#64748b";
  return (
    <div>
      <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl p-3 mb-1.5 cursor-pointer"
        onClick={() => hasKids && setOpen(o=>!o)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {hasKids && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={sc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: open?"rotate(180deg)":"rotate(0deg)", flexShrink:0 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-[12px] truncate">{c.name}</p>
              <p className="text-[#475569] text-[9px] font-mono">NPI {c.npi}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: sc+"22", color: sc }}>{c.structure}</span>
            <div className="flex gap-2">
              <span className="text-[9px] text-[#64748b]">👥 {c.contacts}</span>
              {c.opps > 0 && <span className="text-[9px] text-[#3b82f6]">📈 {c.opps}</span>}
            </div>
          </div>
        </div>
      </div>
      {hasKids && open && (
        <div className="ml-4 border-l-2 border-dashed border-[#1e3a5f] pl-3 mb-1">
          {c.children.map((kid: any) => <ChildNode key={kid.name} c={kid} depth={depth+1} />)}
        </div>
      )}
    </div>
  );
}

export function OrgDetailTabHierarchy() {
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

      {/* Tab bar — Hierarchy active */}
      <div className="flex border-b border-[#1e3a5f] px-4 flex-shrink-0">
        {["Overview","Contacts","Hierarchy","Activity"].map(t => (
          <button key={t} className="flex-1 py-2.5 text-[12px] font-semibold border-b-2 transition-all"
            style={{ borderColor: t==="Hierarchy"?"#6366f1":"transparent", color: t==="Hierarchy"?"#818cf8":"#475569" }}>
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pt-3 pb-24 px-4">
        {/* Root node */}
        <div className="bg-[#6366f118] border-2 border-[#6366f155] rounded-2xl p-3.5 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#1e3a5f] flex items-center justify-center text-[20px] flex-shrink-0 border border-[#6366f133]">🏥</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-white font-bold text-[14px]">{org.name}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f133] text-[#818cf8]">Root · Enterprise</span>
              </div>
              <p className="text-[#475569] text-[10px] font-mono mt-0.5">NPI {org.npi}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-[#6366f133]">
            {[{v:org.contacts,l:"Contacts",c:"#94a3b8"},{v:org.children.length,l:"Facilities",c:"#6366f1"},{v:org.opps,l:"Active Deals",c:"#3b82f6"}].map(m => (
              <div key={m.l} className="flex flex-col items-center">
                <span className="font-bold text-[15px]" style={{ color: m.c }}>{m.v}</span>
                <span className="text-[9px] text-[#475569]">{m.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mb-3">
          {Object.entries(structTierColors).map(([k,c]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
              <span className="text-[10px] text-[#475569]">{k}</span>
            </div>
          ))}
          <span className="ml-auto text-[#475569] text-[10px]">Tap to expand</span>
        </div>

        {/* Children tree */}
        <div className="border-l-2 border-dashed border-[#1e3a5f] pl-3 ml-2">
          {org.children.map(c => <ChildNode key={c.name} c={c} depth={0} />)}
        </div>

        {/* Add facility CTA */}
        <button className="w-full flex items-center justify-center gap-2 border border-dashed border-[#1e3a5f] rounded-2xl py-3 mt-2 text-[#475569] text-[12px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Facility / Sub-Organization
        </button>

        {/* Scan prompt */}
        <div className="flex items-center gap-2.5 bg-[#6366f112] border border-[#6366f133] rounded-2xl px-3.5 py-3 mt-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <p className="text-[#818cf8] text-[11px] font-semibold flex-1">Scan a facility logo to auto-link it here</p>
          <button className="bg-[#6366f1] text-white text-[10px] font-bold px-2 py-1.5 rounded-xl">Scan</button>
        </div>
      </div>

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2 py-0.5 rounded-full border border-[#1e3a5f]">Hierarchy Tab</span>
      </div>
    </div>
  );
}
