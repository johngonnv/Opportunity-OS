import { useState } from "react";

const VIEWS = [
  "All","Health Systems","Hospitals","Hospice","Home Health",
  "No Parent","Has Children","Has Contacts","Active Pipeline","Stale (90d)","Missing Data",
];

const orgs = [
  { id:"1", name:"Memorial Health System", parent:null, city:"Savannah", state:"GA", type:"Health System", structure:"Enterprise", vertical:"Healthcare", contacts:22, children:4, opps:3, pipeline:"$1.8M" },
  { id:"2", name:"Memorial University Med Ctr", parent:"Memorial Health System", city:"Savannah", state:"GA", type:"Hospital", structure:"Regional", vertical:"Healthcare", contacts:14, children:2, opps:1, pipeline:"$640K" },
  { id:"3", name:"St. Joseph's/Candler", parent:null, city:"Savannah", state:"GA", type:"Health System", structure:"Enterprise", vertical:"Healthcare", contacts:11, children:3, opps:2, pipeline:"$920K" },
  { id:"4", name:"Coastal Hospice & Palliative", parent:null, city:"Brunswick", state:"GA", type:"Hospice", structure:"Parent", vertical:"Healthcare", contacts:5, children:0, opps:0, pipeline:null },
  { id:"5", name:"Southeast Georgia Health Sys", parent:null, city:"Brunswick", state:"GA", type:"Health System", structure:"Enterprise", vertical:"Healthcare", contacts:9, children:2, opps:1, pipeline:"$310K" },
];

const typeColors: Record<string,string> = {
  "Health System":"#6366f1","Hospital":"#10b981","Hospice":"#f59e0b","Home Health":"#3b82f6",
};

function OrgCard({ org }: { org: typeof orgs[0] }) {
  const color = typeColors[org.type] ?? "#64748b";
  return (
    <div className="flex items-center gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl p-3 mb-2">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-[20px]"
        style={{ backgroundColor: color + "22" }}>
        {org.type === "Hospice" ? "🕊️" : org.type === "Home Health" ? "🏠" : "🏥"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-[15px] truncate leading-tight">{org.name}</p>
        {org.parent && <p className="text-[#475569] text-[11px] italic">↳ {org.parent}</p>}
        {org.city && <p className="text-[#64748b] text-[12px]">{org.city}, {org.state}</p>}
        <div className="flex flex-wrap gap-1 mt-1.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: color+"22", color }}>{org.type}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#1e3a5f] text-[#94a3b8]">{org.structure}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#1e3a5f] text-[#94a3b8]">{org.vertical}</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          {org.contacts > 0 && <span className="flex items-center gap-1 text-[#64748b] text-[11px]">👥 {org.contacts}</span>}
          {org.children > 0 && <span className="flex items-center gap-1 text-[#64748b] text-[11px]">⑂ {org.children}</span>}
          {org.opps > 0 && <span className="flex items-center gap-1 text-[#3b82f6] text-[11px]">📈 {org.opps}</span>}
          {org.pipeline && <span className="text-[#f59e0b] text-[11px] font-semibold">{org.pipeline}</span>}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  );
}

export function OrgsTabCurrent() {
  const [activeView, setActiveView] = useState("All");

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans">
      <div className="flex items-center justify-between px-5 pt-12 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[20px]">🏥</span>
          <span className="text-white font-bold text-[20px]">Organizations</span>
        </div>
        <button className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <div className="mx-4 mb-2 flex items-center bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl py-2.5">
        {[["183","Total Orgs"],["24","Health Systems"],["7","Open Pipeline"]].map(([v,l],i) => (
          <div key={l} className="flex-1 flex flex-col items-center">
            <span className={`font-bold text-[18px] ${i===2?"text-[#10b981]":"text-white"}`}>{v}</span>
            <span className="text-[#64748b] text-[11px]">{l}</span>
          </div>
        ))}
      </div>

      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3.5 py-2.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="bg-transparent flex-1 text-[#94a3b8] text-[13px] outline-none placeholder:text-[#475569]" placeholder="Search organizations..." />
        </div>
      </div>

      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto scrollbar-none">
        {VIEWS.map(v => (
          <button key={v} onClick={() => setActiveView(v)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all"
            style={{ backgroundColor: activeView===v?"#10b98118":"#0d1f3a", borderColor: activeView===v?"#10b981":"#1e3a5f", color: activeView===v?"#10b981":"#64748b" }}>
            {v}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 pb-2">
        <button className="flex items-center gap-1.5 bg-[#0d1f3a] border border-[#1e3a5f] rounded-lg px-2.5 py-1.5">
          <span className="text-[#64748b] text-[12px]">Date Added ↓</span>
        </button>
        <button className="flex items-center gap-1.5 bg-[#0d1f3a] border border-[#1e3a5f] rounded-lg px-2.5 py-1.5">
          <span className="text-[#64748b] text-[12px]">Filter</span>
        </button>
        <span className="ml-auto text-[#334155] text-[11px]">183 orgs</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {orgs.map(org => <OrgCard key={org.id} org={org} />)}
        <div className="flex flex-col items-center justify-center gap-2 py-8 opacity-40">
          <span className="text-[#475569] text-[12px]">Scroll to load more…</span>
        </div>
      </div>

      <div className="flex justify-center py-2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2.5 py-0.5 rounded-full border border-[#1e3a5f]">/(tabs)/organizations</span>
      </div>
    </div>
  );
}
