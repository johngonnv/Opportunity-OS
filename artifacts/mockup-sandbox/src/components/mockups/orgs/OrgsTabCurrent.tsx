import { useState } from "react";

const VIEWS = [
  "All","Enterprise","Parent Accounts","Regionals","Local Entities",
  "No Parent","Has Children","Healthcare","GovCon","General Biz",
  "Government","Has Contacts","Active Pipeline","Stale (90d)","Missing Data",
];

const orgs = [
  { id:"1", name:"Lockheed Martin Corp", parent:null, city:"Bethesda", state:"MD", type:"Prime Contractor", structure:"Enterprise", vertical:"GovCon", contacts:18, children:4, opps:3, pipeline:"$2.4M" },
  { id:"2", name:"LM Aeronautics Co.", parent:"Lockheed Martin Corp", city:"Fort Worth", state:"TX", type:"Subsidiary", structure:"Regional", vertical:"GovCon", contacts:9, children:2, opps:1, pipeline:"$840K" },
  { id:"3", name:"Raytheon Technologies", parent:null, city:"Arlington", state:"VA", type:"Prime Contractor", structure:"Enterprise", vertical:"GovCon", contacts:11, children:3, opps:2, pipeline:"$1.1M" },
  { id:"4", name:"Memorial Health System", parent:null, city:"Savannah", state:"GA", type:"Health System", structure:"Parent", vertical:"Healthcare", contacts:7, children:5, opps:0, pipeline:null },
  { id:"5", name:"Booz Allen Hamilton", parent:null, city:"McLean", state:"VA", type:"Consulting", structure:"Enterprise", vertical:"GovCon", contacts:5, children:0, opps:1, pipeline:"$390K" },
];

const typeColors: Record<string,string> = {
  "Prime Contractor":"#6366f1","Subsidiary":"#10b981","Health System":"#f59e0b","Consulting":"#3b82f6",
};

function OrgCard({ org }: { org: typeof orgs[0] }) {
  const color = typeColors[org.type] ?? "#64748b";
  const icon = org.vertical === "Healthcare" ? "🏥" : "💼";
  return (
    <div className="flex items-center gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl p-3 mb-2">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-[18px]"
        style={{ backgroundColor: color + "22" }}>
        {icon}
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
          {org.contacts > 0 && (
            <span className="flex items-center gap-1 text-[#64748b] text-[11px]">👥 {org.contacts}</span>
          )}
          {org.children > 0 && (
            <span className="flex items-center gap-1 text-[#64748b] text-[11px]">⑂ {org.children}</span>
          )}
          {org.opps > 0 && (
            <span className="flex items-center gap-1 text-[#3b82f6] text-[11px]">📈 {org.opps}</span>
          )}
          {org.pipeline && (
            <span className="text-[#f59e0b] text-[11px] font-semibold">{org.pipeline}</span>
          )}
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
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans">
      {/* ModeHeader */}
      <div className="flex items-center justify-between px-5 pt-12 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[20px]">💼</span>
          <span className="text-white font-bold text-[20px]">Organizations</span>
        </div>
        <button className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {/* KPI strip */}
      <div className="mx-4 mb-2 flex items-center bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl py-2.5">
        {[["247","Total Orgs"],["12","Enterprise"],["6","Open Pipeline"]].map(([v,l],i) => (
          <div key={l} className="flex-1 flex flex-col items-center">
            {i > 0 && <div className="absolute h-7 w-px bg-[#1e3a5f]" style={{marginLeft: -1}} />}
            <span className={`font-bold text-[18px] ${i===2?"text-[#10b981]":"text-white"}`}>{v}</span>
            <span className="text-[#64748b] text-[11px]">{l}</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3.5 py-2.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="bg-transparent flex-1 text-[#94a3b8] text-[13px] outline-none placeholder:text-[#475569]"
            placeholder="Search organizations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* View chips */}
      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto scrollbar-none">
        {VIEWS.map(v => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all"
            style={{
              backgroundColor: activeView===v ? "#10b98118" : "#0d1f3a",
              borderColor: activeView===v ? "#10b981" : "#1e3a5f",
              color: activeView===v ? "#10b981" : "#64748b",
            }}
          >{v}</button>
        ))}
      </div>

      {/* Sort/Filter toolbar */}
      <div className="flex items-center gap-2 px-4 pb-2">
        <button className="flex items-center gap-1.5 bg-[#0d1f3a] border border-[#1e3a5f] rounded-lg px-2.5 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          <span className="text-[#64748b] text-[12px]">Date Added ↓</span>
        </button>
        <button className="flex items-center gap-1.5 bg-[#0d1f3a] border border-[#1e3a5f] rounded-lg px-2.5 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          <span className="text-[#64748b] text-[12px]">Filter</span>
        </button>
        <span className="ml-auto text-[#334155] text-[11px]">247 orgs</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {orgs.map(org => <OrgCard key={org.id} org={org} />)}
        <div className="flex flex-col items-center justify-center gap-2 py-8 opacity-40">
          <span className="text-[#475569] text-[12px]">Scroll to load more…</span>
        </div>
      </div>

      {/* Route badge */}
      <div className="flex justify-center py-2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2.5 py-0.5 rounded-full border border-[#1e3a5f]">
          /(tabs)/organizations
        </span>
      </div>
    </div>
  );
}
