import { useState } from "react";

const org = {
  name: "Memorial Health System",
  legalName: "Memorial Health University Medical Center, Inc.",
  npi: "1234567890",
  naics: "622110",
  type: "Health System", typeColor: "#6366f1",
  structure: "Enterprise", structColor: "#6366f1",
  vertical: "Healthcare", vertColor: "#10b981",
  state: "ACTIVE", stateColor: "#10b981", stateLabel: "Active",
  city: "Savannah", stateAbbr: "GA",
  website: "memorialhealth.com",
  phone: "+1 (912) 350-8000",
  viaEye: true, scanDate: "May 20, 2026",
  contacts: [
    { id:"c1", name:"Dr. Angela Torres", title:"Chief Medical Officer",  dept:"Executive",  strength:"WARM", strengthColor:"#f59e0b", viaEye:true  },
    { id:"c2", name:"Sandra Cho",        title:"Chief Operating Officer",dept:"Executive",  strength:"HOT",  strengthColor:"#10b981", viaEye:false },
    { id:"c3", name:"David Reyes",       title:"Dir. Supply Chain",      dept:"Procurement",strength:"COLD", strengthColor:"#64748b", viaEye:true  },
    { id:"c4", name:"Dr. Rachel Kim",    title:"Medical Director, Onco.",dept:"Clinical",   strength:"WARM", strengthColor:"#f59e0b", viaEye:true  },
  ],
  children: [
    { name:"Memorial Univ. Med Ctr",  structure:"regional",   contacts:14, opps:1 },
    { name:"Memorial Pediatric Hosp.",structure:"regional",   contacts:7,  opps:0 },
    { name:"Coastal Imaging Center",  structure:"local",      contacts:3,  opps:1 },
  ],
  opps: [
    { title:"EHR Integration — Epic",          stage:"Proposal",      value:"$1.1M", color:"#3b82f6", pct:55 },
    { title:"Medical Device Supply Agreement", stage:"Qualification",  value:"$280K", color:"#f59e0b", pct:25 },
  ],
  timeline: [
    { icon:"📞", text:"Call with Dr. Torres — EHR readiness review",  sub:"3 days ago"  },
    { icon:"📧", text:"Proposal sent to supply chain team",             sub:"1 week ago"  },
    { icon:"📋", text:"Site visit — Memorial Univ. Med Ctr",           sub:"2 weeks ago" },
  ],
};

const structTierColors: Record<string,string> = {
  enterprise:"#6366f1", parent:"#10b981", regional:"#3b82f6", local:"#64748b",
};

function TabBar({ tabs, active, onSelect }: { tabs:string[]; active:string; onSelect:(t:string)=>void }) {
  return (
    <div className="flex border-b border-[#1e3a5f] px-4">
      {tabs.map(t => (
        <button key={t} onClick={() => onSelect(t)}
          className="flex-1 py-2.5 text-[12px] font-semibold border-b-2 transition-all"
          style={{ borderColor: active===t?"#6366f1":"transparent", color: active===t?"#818cf8":"#475569" }}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function OrgDetailProposed() {
  const [tab, setTab] = useState("Overview");
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans relative overflow-hidden">
      {/* Fixed header */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-2 px-4 pt-12 pb-2">
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1e3a5f]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-[#64748b] text-[12px]">Organizations</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          <span className="text-white text-[13px] font-semibold flex-1 truncate">{org.name}</span>
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1e3a5f]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </button>
        </div>

        {/* Identity card */}
        <div className="mx-4 mb-2 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl p-4"
          style={{ borderLeftWidth: 4, borderLeftColor: org.typeColor }}>
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#1e3a5f] flex items-center justify-center text-[24px] flex-shrink-0 border border-[#6366f133]">🏥</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-white font-bold text-[16px] leading-tight">{org.name}</span>
                {org.viaEye && (
                  <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f125] text-[#818cf8] border border-[#6366f130]">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Eye · {org.scanDate}
                  </span>
                )}
              </div>
              <p className="text-[#64748b] text-[10px] font-mono mt-1">NPI {org.npi} · {org.city}, {org.stateAbbr}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {[{l:org.type,c:org.typeColor},{l:org.structure,c:org.structColor},{l:org.vertical,c:org.vertColor},{l:org.stateLabel,c:org.stateColor}].map(b => (
                  <span key={b.l} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: b.c+"22", color: b.c }}>{b.l}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-[#1e3a5f]">
            {[{v:org.contacts.length.toString(),l:"Contacts",c:"#94a3b8"},{v:org.children.length.toString(),l:"Facilities",c:"#6366f1"},{v:org.opps.length.toString(),l:"Deals",c:"#3b82f6"},{v:"$1.4M",l:"Pipeline",c:"#f59e0b"}].map(m => (
              <div key={m.l} className="flex flex-col items-center">
                <span className="font-bold text-[15px]" style={{ color: m.c }}>{m.v}</span>
                <span className="text-[9px] text-[#475569]">{m.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 px-4 mb-2 overflow-x-auto scrollbar-none">
          {[{i:"✏️",l:"Edit",c:"#10b981"},{i:"👁",l:"Eye Scan",c:"#6366f1"},{i:"⑂",l:"Hierarchy",c:"#3b82f6"},{i:"↗️",l:"Share",c:"#64748b"}].map(t => (
            <button key={t.l} className="flex items-center gap-1.5 flex-shrink-0 border rounded-xl px-3 py-2 text-[11px] font-semibold"
              style={{ borderColor: t.c+"44", color: t.c, backgroundColor: t.c+"0f" }}>
              <span>{t.i}</span>{t.l}
            </button>
          ))}
        </div>

        <TabBar tabs={["Overview","Contacts","Hierarchy","Activity"]} active={tab} onSelect={setTab} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-24">
        {tab === "Overview" && (
          <div className="pt-3">
            <div className="mx-4 mb-3 bg-[#10b98110] border border-[#10b98130] rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#10b98130] flex items-center justify-center text-[18px] flex-shrink-0">🎯</div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-[13px]">Capture Supply Chain Contact</p>
                <p className="text-[#64748b] text-[11px] mt-0.5">No procurement officer on file</p>
              </div>
              <button className="bg-[#10b981] text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl flex-shrink-0">Go</button>
            </div>

            <div className="mx-4 mb-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl p-3">
              <p className="text-[#64748b] text-[10px] font-semibold uppercase tracking-wider mb-2.5">Account Intelligence</p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="flex justify-between mb-1"><span className="text-[10px] text-[#64748b]">Health</span><span className="text-[10px] font-bold text-[#10b981]">68%</span></div>
                  <div className="h-1.5 bg-[#1e3a5f] rounded-full overflow-hidden"><div className="h-full bg-[#10b981] rounded-full" style={{ width:"68%" }} /></div>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-1"><span className="text-[10px] text-[#64748b]">Risk</span><span className="text-[10px] font-bold text-[#3b82f6]">Low</span></div>
                  <div className="h-1.5 bg-[#1e3a5f] rounded-full overflow-hidden"><div className="h-full bg-[#3b82f6] rounded-full" style={{ width:"18%" }} /></div>
                </div>
                <div className="flex items-center gap-1.5 bg-[#f59e0b18] border border-[#f59e0b33] rounded-xl px-2 py-1">
                  <span className="text-[#f59e0b] font-bold text-[14px]">3</span>
                  <span className="text-[#f59e0b] text-[9px]">Gaps</span>
                </div>
              </div>
            </div>

            <div className="mx-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#64748b] text-[11px] font-semibold uppercase tracking-wider">Pipeline ({org.opps.length})</span>
                <span className="text-[#10b981] text-[11px] font-semibold">+ New Opp</span>
              </div>
              {org.opps.map(o => (
                <div key={o.title} className="flex items-center gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3.5 py-3 mb-2">
                  <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[12px] font-semibold truncate">{o.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-[#64748b]">{o.stage}</span>
                      <div className="flex-1 h-1 bg-[#1e3a5f] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width:`${o.pct}%`, backgroundColor: o.color }} />
                      </div>
                      <span className="text-[10px] text-[#64748b]">{o.pct}%</span>
                    </div>
                  </div>
                  <span className="text-[#f59e0b] text-[13px] font-bold flex-shrink-0">{o.value}</span>
                </div>
              ))}
            </div>

            <div className="mx-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#64748b] text-[11px] font-semibold uppercase tracking-wider">Recent Activity</span>
                <span className="text-[#6366f1] text-[11px] font-semibold">See all</span>
              </div>
              <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl divide-y divide-[#1e3a5f]">
                {org.timeline.slice(0,2).map((a,i) => (
                  <div key={i} className="flex gap-3 p-3">
                    <span className="text-[14px]">{a.icon}</span>
                    <div><p className="text-white text-[12px]">{a.text}</p><p className="text-[#475569] text-[10px] mt-0.5">{a.sub}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "Contacts" && (
          <div className="pt-3 px-4">
            <div className="flex items-center gap-2.5 bg-[#6366f112] border border-[#6366f133] rounded-2xl px-3.5 py-3 mb-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <p className="text-[#818cf8] text-[12px] font-semibold flex-1">Scan a business card into this org</p>
              <button className="bg-[#6366f1] text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl">Scan</button>
            </div>
            {org.contacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3.5 py-3 mb-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                  style={{ backgroundColor: c.strengthColor+"28", color: c.strengthColor }}>
                  {c.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-semibold text-[13px]">{c.name}</span>
                    {c.viaEye && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f125] text-[#818cf8]">👁 Eye</span>}
                  </div>
                  <p className="text-[#64748b] text-[11px] truncate">{c.title}</p>
                  <span className="text-[9px] text-[#475569] bg-[#1e3a5f] px-1.5 py-0.5 rounded-full">{c.dept}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: c.strengthColor+"22", color: c.strengthColor }}>{c.strength}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "Hierarchy" && (
          <div className="pt-3 px-4">
            <div className="bg-[#6366f118] border-2 border-[#6366f155] rounded-2xl p-3.5 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[20px]">🏥</span>
                <div>
                  <p className="text-white font-bold text-[14px]">{org.name}</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f133] text-[#818cf8]">Health System · Root</span>
                </div>
              </div>
              <div className="flex gap-3 mt-2 pt-2 border-t border-[#6366f133]">
                <span className="text-[10px] text-[#64748b]">👥 {org.contacts.length} contacts</span>
                <span className="text-[10px] text-[#64748b]">📈 {org.opps.length} deals</span>
                <span className="text-[10px] font-mono text-[#475569]">NPI {org.npi}</span>
              </div>
            </div>
            <div className="ml-4 border-l-2 border-dashed border-[#1e3a5f] pl-3">
              {org.children.map(c => (
                <div key={c.name} className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl p-3 mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold text-[12px]">{c.name}</p>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full mt-1 inline-block"
                        style={{ backgroundColor: (structTierColors[c.structure]||"#64748b")+"22", color: structTierColors[c.structure]||"#64748b" }}>
                        {c.structure}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[#64748b] text-[10px]">👥 {c.contacts}</p>
                      <p className="text-[#3b82f6] text-[10px]">📈 {c.opps}</p>
                    </div>
                  </div>
                </div>
              ))}
              <button className="w-full flex items-center justify-center gap-2 border border-dashed border-[#1e3a5f] rounded-xl py-2.5 text-[#475569] text-[11px]">
                + Add Facility
              </button>
            </div>
          </div>
        )}

        {tab === "Activity" && (
          <div className="pt-3 px-4">
            <div className="flex gap-2 mb-3">
              {["+ Log Call","+ Note","+ Meeting"].map(a => (
                <button key={a} className="flex-1 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl py-2 text-[11px] text-[#64748b] font-semibold">{a}</button>
              ))}
            </div>
            {org.timeline.map((a,i) => (
              <div key={i} className="flex gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl p-3.5 mb-2">
                <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center text-[14px] flex-shrink-0">{a.icon}</div>
                <div><p className="text-white text-[12px] font-semibold">{a.text}</p><p className="text-[#475569] text-[10px] mt-0.5">{a.sub}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <div className="absolute bottom-6 right-4 flex flex-col items-end gap-2">
        {fabOpen && (
          <>
            <div className="flex items-center gap-2">
              <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3 py-1.5 shadow-lg">
                <span className="text-white text-[11px] font-semibold whitespace-nowrap">Add Contact Manually</span>
              </div>
              <button className="w-10 h-10 rounded-full bg-[#10b981] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3 py-1.5 shadow-lg">
                <span className="text-white text-[11px] font-semibold whitespace-nowrap">Scan Card into this Org</span>
              </div>
              <button className="w-10 h-10 rounded-full bg-[#6366f1] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </>
        )}
        <button className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all"
          style={{ backgroundColor: fabOpen?"#ef4444":"#6366f1", transform: fabOpen?"rotate(45deg)":"rotate(0deg)" }}
          onClick={() => setFabOpen(o=>!o)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      {fabOpen && <div className="absolute inset-0 bg-black/30" onClick={() => setFabOpen(false)} />}

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2 py-0.5 rounded-full border border-[#1e3a5f]">/organization/[id]</span>
      </div>
    </div>
  );
}
