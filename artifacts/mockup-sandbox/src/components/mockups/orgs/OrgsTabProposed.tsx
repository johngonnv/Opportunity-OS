import { useState } from "react";

const VIEWS = ["All","Health Systems","Hospitals","Active Pipeline","Stale (90d)"];

type Org = {
  id: string; name: string; parent: string | null; city: string; state: string;
  type: string; structure: "enterprise"|"parent"|"regional"|"local";
  vertical: string; contacts: number; children: number; opps: number;
  pipeline: string | null; viaEye?: boolean; scanDate?: string;
};

const orgs: Org[] = [
  { id:"1", name:"Memorial Health System", parent:null, city:"Savannah", state:"GA", type:"Health System", structure:"enterprise", vertical:"Healthcare", contacts:22, children:4, opps:3, pipeline:"$1.8M", viaEye:true, scanDate:"2d ago" },
  { id:"2", name:"Memorial Univ. Med Ctr", parent:"Memorial Health System", city:"Savannah", state:"GA", type:"Hospital", structure:"regional", vertical:"Healthcare", contacts:14, children:2, opps:1, pipeline:"$640K", viaEye:true, scanDate:"2d ago" },
  { id:"3", name:"St. Joseph's/Candler", parent:null, city:"Savannah", state:"GA", type:"Health System", structure:"enterprise", vertical:"Healthcare", contacts:11, children:3, opps:2, pipeline:"$920K", viaEye:false },
  { id:"4", name:"Coastal Hospice & Palliative", parent:null, city:"Brunswick", state:"GA", type:"Hospice", structure:"parent", vertical:"Healthcare", contacts:5, children:0, opps:0, pipeline:null, viaEye:false },
  { id:"5", name:"SE Georgia Health System", parent:null, city:"Brunswick", state:"GA", type:"Health System", structure:"enterprise", vertical:"Healthcare", contacts:9, children:2, opps:1, pipeline:"$310K", viaEye:true, scanDate:"5d ago" },
];

const structureConfig = {
  enterprise: { label:"Health System", color:"#6366f1", dot:"●" },
  parent:     { label:"Parent",        color:"#10b981", dot:"◆" },
  regional:   { label:"Hospital",      color:"#3b82f6", dot:"▲" },
  local:      { label:"Facility",      color:"#64748b", dot:"■" },
};

const typeIcons: Record<string,string> = {
  "Health System":"🏥","Hospital":"🏨","Hospice":"🕊️","Home Health":"🏠",
};

function OrgCard({ org }: { org: Org }) {
  const sc = structureConfig[org.structure];
  return (
    <div className="w-full text-left flex items-stretch gap-0 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl mb-2 overflow-hidden">
      <div className="w-1 flex-shrink-0 rounded-l-2xl" style={{ backgroundColor: sc.color }} />
      <div className="flex items-center gap-3 flex-1 px-3 py-3 min-w-0">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[20px] flex-shrink-0 bg-[#1e3a5f]">
          {typeIcons[org.type] ?? "🏥"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-white font-bold text-[14px] leading-tight truncate">{org.name}</span>
            {org.viaEye && (
              <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f125] text-[#818cf8] border border-[#6366f130]">
                👁 {org.scanDate}
              </span>
            )}
          </div>
          {org.parent && <p className="text-[#475569] text-[11px] mt-0.5">↳ {org.parent}</p>}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[#64748b] text-[11px]">{org.city}, {org.state}</span>
            <span className="text-[#334155]">·</span>
            <span className="text-[11px] font-semibold" style={{ color: sc.color }}>{sc.dot} {sc.label}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[#64748b] text-[11px]">👥 {org.contacts}</span>
            {org.children > 0 && <span className="text-[#64748b] text-[11px]">⑂ {org.children}</span>}
            {org.opps > 0 && <span className="text-[#3b82f6] text-[11px] font-semibold">📈 {org.opps} deals</span>}
            {org.pipeline && <span className="text-[#f59e0b] text-[11px] font-bold">{org.pipeline}</span>}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#1e3a5f] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
          </div>
          <span className="text-[9px] text-[#334155]">tree</span>
        </div>
      </div>
    </div>
  );
}

export function OrgsTabProposed() {
  const [activeView, setActiveView] = useState("All");
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans relative overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-12 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[20px]">🏥</span>
            <span className="text-white font-bold text-[20px]">Organizations</span>
          </div>
          <p className="text-[#475569] text-[11px] pl-8 mt-0.5">183 orgs · 28 captured via Eye</p>
        </div>
        <button className="flex items-center gap-1.5 bg-[#6366f118] border border-[#6366f155] rounded-full px-3 py-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span className="text-[#818cf8] text-[12px] font-semibold">Scan</span>
        </button>
      </div>

      <div className="mx-4 mb-2 grid grid-cols-4 gap-1">
        {[
          { v:"183",  l:"Orgs",       color:"#fff"     },
          { v:"24",   l:"Sys.",        color:"#6366f1"  },
          { v:"$3.6M",l:"Pipeline",   color:"#f59e0b"  },
          { v:"28",   l:"Via Eye",    color:"#818cf8"  },
        ].map(m => (
          <div key={m.l} className="flex flex-col items-center bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl py-2">
            <span className="font-bold text-[15px] leading-tight" style={{ color: m.color }}>{m.v}</span>
            <span className="text-[9px] text-[#475569] mt-0.5">{m.l}</span>
          </div>
        ))}
      </div>

      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3.5 py-2.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="bg-transparent flex-1 text-[#94a3b8] text-[13px] outline-none placeholder:text-[#475569]" placeholder="Search orgs, NPI, location…" />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
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
          <span className="text-[#64748b] text-[12px]">Sort</span>
        </button>
        <button className="flex items-center gap-1.5 bg-[#0d1f3a] border border-[#1e3a5f] rounded-lg px-2.5 py-1.5">
          <span className="text-[#64748b] text-[12px]">Filter</span>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          {Object.values(structureConfig).map(v => (
            <span key={v.label} className="text-[11px]" style={{ color: v.color }}>{v.dot}</span>
          ))}
          <span className="text-[#334155] text-[10px]">Tier</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28">
        {orgs.map(org => <OrgCard key={org.id} org={org} />)}
        <div className="flex items-center gap-2 my-3">
          <div className="flex-1 h-px bg-[#1e3a5f]" />
          <span className="text-[10px] text-[#475569] font-semibold uppercase tracking-wider">No activity · 90d+</span>
          <div className="flex-1 h-px bg-[#1e3a5f]" />
        </div>
        <div className="bg-[#0d1f3a] border border-dashed border-[#1e3a5f] rounded-2xl p-4 flex items-center gap-3">
          <span className="text-[22px]">⏱️</span>
          <div>
            <p className="text-[#64748b] text-[13px] font-semibold">11 stale organizations</p>
            <p className="text-[#475569] text-[11px]">No updates in 90+ days · Tap to review</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-7 right-5 flex flex-col items-end gap-2.5">
        {fabOpen && (
          <>
            <div className="flex items-center gap-2.5">
              <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3 py-2 shadow-xl">
                <span className="text-white text-[12px] font-semibold whitespace-nowrap">Add Organization Manually</span>
              </div>
              <button className="w-11 h-11 rounded-full bg-[#10b981] flex items-center justify-center shadow-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3 py-2 shadow-xl">
                <span className="text-white text-[12px] font-semibold whitespace-nowrap">Scan Logo via Opportunity Eye</span>
              </div>
              <button className="w-11 h-11 rounded-full bg-[#6366f1] flex items-center justify-center shadow-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </>
        )}
        <button className="w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200"
          style={{ backgroundColor: fabOpen?"#ef4444":"#6366f1", transform: fabOpen?"rotate(45deg)":"rotate(0deg)" }}
          onClick={() => setFabOpen(o => !o)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      {fabOpen && <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setFabOpen(false)} />}

      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2.5 py-0.5 rounded-full border border-[#1e3a5f]">/(tabs)/organizations</span>
      </div>
    </div>
  );
}
