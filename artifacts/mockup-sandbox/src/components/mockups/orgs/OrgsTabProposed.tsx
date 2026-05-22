import { useState } from "react";

const VIEWS = ["All","Enterprise","GovCon","Healthcare","Active Pipeline","Stale (90d)"];

type Org = {
  id: string; name: string; parent: string | null; city: string; state: string;
  type: string; structure: "enterprise"|"parent"|"regional"|"local";
  vertical: string; contacts: number; children: number; opps: number;
  pipeline: string | null; viaEye?: boolean; scanDate?: string;
};

const orgs: Org[] = [
  { id:"1", name:"Lockheed Martin Corp", parent:null, city:"Bethesda", state:"MD", type:"Prime Contractor", structure:"enterprise", vertical:"GovCon", contacts:18, children:4, opps:3, pipeline:"$2.4M", viaEye:true, scanDate:"2d ago" },
  { id:"2", name:"LM Aeronautics Co.", parent:"Lockheed Martin Corp", city:"Fort Worth", state:"TX", type:"Subsidiary", structure:"regional", vertical:"GovCon", contacts:9, children:2, opps:1, pipeline:"$840K", viaEye:true, scanDate:"2d ago" },
  { id:"3", name:"Raytheon Technologies", parent:null, city:"Arlington", state:"VA", type:"Prime Contractor", structure:"enterprise", vertical:"GovCon", contacts:11, children:3, opps:2, pipeline:"$1.1M", viaEye:false },
  { id:"4", name:"Memorial Health System", parent:null, city:"Savannah", state:"GA", type:"Health System", structure:"parent", vertical:"Healthcare", contacts:7, children:5, opps:0, pipeline:null, viaEye:false },
  { id:"5", name:"Booz Allen Hamilton", parent:null, city:"McLean", state:"VA", type:"Consulting", structure:"enterprise", vertical:"GovCon", contacts:5, children:0, opps:1, pipeline:"$390K", viaEye:true, scanDate:"5d ago" },
];

const structureConfig = {
  enterprise: { label:"Enterprise", color:"#6366f1", dot:"●" },
  parent:     { label:"Parent",     color:"#10b981", dot:"◆" },
  regional:   { label:"Regional",   color:"#3b82f6", dot:"▲" },
  local:      { label:"Local",      color:"#64748b", dot:"■" },
};

const verticalIcons: Record<string,string> = {
  GovCon:"🛡️", Healthcare:"🏥", "General Biz":"🏢", Government:"⚖️",
};

function OrgCard({ org, onSelect }: { org: Org; onSelect: () => void }) {
  const sc = structureConfig[org.structure];
  return (
    <button
      onClick={onSelect}
      className="w-full text-left flex items-stretch gap-0 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl mb-2 overflow-hidden hover:border-[#334155] transition-colors"
    >
      {/* Structure accent bar */}
      <div className="w-1 flex-shrink-0 rounded-l-2xl" style={{ backgroundColor: sc.color }} />

      <div className="flex items-center gap-3 flex-1 px-3 py-3 min-w-0">
        {/* Logo / icon */}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[20px] flex-shrink-0 bg-[#1e3a5f]">
          {verticalIcons[org.vertical] ?? "🏢"}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-white font-bold text-[14px] leading-tight truncate">{org.name}</span>
            {org.viaEye && (
              <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f125] text-[#818cf8] border border-[#6366f130]">
                👁 {org.scanDate}
              </span>
            )}
          </div>

          {/* Parent line */}
          {org.parent && (
            <p className="text-[#475569] text-[11px] mt-0.5">↳ {org.parent}</p>
          )}

          {/* Location + vertical */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[#64748b] text-[11px]">{org.city}, {org.state}</span>
            <span className="text-[#334155]">·</span>
            <span className="text-[11px] font-semibold" style={{ color: sc.color }}>{sc.dot} {sc.label}</span>
            <span className="text-[#334155]">·</span>
            <span className="text-[#64748b] text-[11px]">{org.vertical}</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[#64748b] text-[11px]">👥 {org.contacts}</span>
            {org.children > 0 && <span className="text-[#64748b] text-[11px]">⑂ {org.children}</span>}
            {org.opps > 0 && <span className="text-[#3b82f6] text-[11px] font-semibold">📈 {org.opps} deals</span>}
            {org.pipeline && <span className="text-[#f59e0b] text-[11px] font-bold">{org.pipeline}</span>}
          </div>
        </div>

        {/* Hierarchy button */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#1e3a5f] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
              <path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
          </div>
          <span className="text-[9px] text-[#334155]">tree</span>
        </div>
      </div>
    </button>
  );
}

export function OrgsTabProposed() {
  const [activeView, setActiveView] = useState("All");
  const [search, setSearch] = useState("");
  const [fabOpen, setFabOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<string|null>(null);

  const totals = { orgs:247, enterprise:12, pipeline:"$18.4M", eyeScanned:34 };

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[20px]">🏢</span>
            <span className="text-white font-bold text-[20px]">Organizations</span>
          </div>
          <p className="text-[#475569] text-[11px] pl-8 mt-0.5">247 orgs · 34 captured via Eye</p>
        </div>
        {/* Opportunity Eye scan button */}
        <button className="flex items-center gap-1.5 bg-[#6366f118] border border-[#6366f155] rounded-full px-3 py-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          <span className="text-[#818cf8] text-[12px] font-semibold">Scan</span>
        </button>
      </div>

      {/* KPI strip — richer */}
      <div className="mx-4 mb-2 grid grid-cols-4 gap-1">
        {[
          { v: totals.orgs.toString(), l:"Orgs", color:"#fff" },
          { v: totals.enterprise.toString(), l:"Enterprise", color:"#6366f1" },
          { v: totals.pipeline, l:"Pipeline", color:"#f59e0b" },
          { v: totals.eyeScanned.toString(), l:"Via Eye", color:"#818cf8" },
        ].map(m => (
          <div key={m.l} className="flex flex-col items-center bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl py-2">
            <span className="font-bold text-[15px] leading-tight" style={{ color: m.color }}>{m.v}</span>
            <span className="text-[9px] text-[#475569] mt-0.5">{m.l}</span>
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
            placeholder="Search orgs, NAICS, location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {/* Voice/scan search hint */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </div>
      </div>

      {/* View chips — condensed */}
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

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 pb-2">
        <button className="flex items-center gap-1.5 bg-[#0d1f3a] border border-[#1e3a5f] rounded-lg px-2.5 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          <span className="text-[#64748b] text-[12px]">Sort</span>
        </button>
        <button className="flex items-center gap-1.5 bg-[#0d1f3a] border border-[#1e3a5f] rounded-lg px-2.5 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          <span className="text-[#64748b] text-[12px]">Filter</span>
        </button>

        {/* Structure legend inline */}
        <div className="ml-auto flex items-center gap-2">
          {Object.entries(structureConfig).map(([k,v]) => (
            <div key={k} className="flex items-center gap-0.5">
              <span className="text-[10px]" style={{ color: v.color }}>{v.dot}</span>
            </div>
          ))}
          <span className="text-[#334155] text-[10px]">Tier</span>
        </div>
      </div>

      {/* Org list */}
      <div className="flex-1 overflow-y-auto px-4 pb-28">
        {orgs.map(org => (
          <OrgCard
            key={org.id}
            org={org}
            onSelect={() => setSelectedOrg(selectedOrg === org.id ? null : org.id)}
          />
        ))}
        {/* Stale section divider */}
        <div className="flex items-center gap-2 my-3">
          <div className="flex-1 h-px bg-[#1e3a5f]" />
          <span className="text-[10px] text-[#475569] font-semibold uppercase tracking-wider">No activity · 90d+</span>
          <div className="flex-1 h-px bg-[#1e3a5f]" />
        </div>
        <div className="bg-[#0d1f3a] border border-dashed border-[#1e3a5f] rounded-2xl p-4 flex items-center gap-3">
          <span className="text-[22px]">⏱️</span>
          <div>
            <p className="text-[#64748b] text-[13px] font-semibold">14 stale organizations</p>
            <p className="text-[#475569] text-[11px]">No updates in 90+ days · Tap to review</p>
          </div>
        </div>
      </div>

      {/* FAB */}
      <div className="absolute bottom-7 right-5 flex flex-col items-end gap-2.5">
        {fabOpen && (
          <>
            <div className="flex items-center gap-2.5">
              <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3 py-2 shadow-xl">
                <span className="text-white text-[12px] font-semibold whitespace-nowrap">Add Organization Manually</span>
              </div>
              <button className="w-11 h-11 rounded-full bg-[#10b981] flex items-center justify-center shadow-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3 py-2 shadow-xl">
                <span className="text-white text-[12px] font-semibold whitespace-nowrap">Scan Logo via Opportunity Eye</span>
              </div>
              <button className="w-11 h-11 rounded-full bg-[#6366f1] flex items-center justify-center shadow-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </>
        )}
        <button
          className="w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200"
          style={{ backgroundColor: fabOpen ? "#ef4444" : "#6366f1", transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)" }}
          onClick={() => setFabOpen(o => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {fabOpen && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setFabOpen(false)} />
      )}

      {/* Route badge */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2.5 py-0.5 rounded-full border border-[#1e3a5f]">
          /(tabs)/organizations
        </span>
      </div>
    </div>
  );
}
