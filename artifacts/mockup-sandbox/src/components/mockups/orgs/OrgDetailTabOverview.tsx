import { useState } from "react";

const org = {
  name: "Memorial Health System",
  npi: "1234567890",
  typeColor: "#6366f1",
  stateColor: "#10b981", stateLabel: "Active",
  city: "Savannah", stateAbbr: "GA",
  viaEye: true, enrichedAt: "May 20, 2026",
};

const opps = [
  { title: "EHR Integration — Epic",          stage: "Proposal",      value: "$1.1M", color: "#3b82f6", pct: 55 },
  { title: "Medical Device Supply Agreement", stage: "Qualification", value: "$280K", color: "#f59e0b", pct: 25 },
];

const timeline = [
  { icon: "📞", text: "Call with Dr. Torres — EHR readiness review", sub: "3 days ago" },
  { icon: "📧", text: "Proposal sent to supply chain team",            sub: "1 week ago" },
];

export function OrgDetailTabOverview() {
  const [deepOpen, setDeepOpen] = useState(false);

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
          <div className="flex items-center gap-1.5">
            <p className="text-white font-bold text-[13px] truncate">{org.name}</p>
            {org.viaEye && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f125] text-[#818cf8] border border-[#6366f130] flex-shrink-0">
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Eye · {org.enrichedAt}
              </span>
            )}
          </div>
          <p className="text-[#64748b] text-[10px] font-mono">NPI {org.npi} · {org.city}, {org.stateAbbr}</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: org.stateColor + "22", color: org.stateColor }}>● {org.stateLabel}</span>
      </div>

      {/* Tab bar — Overview active */}
      <div className="flex border-b border-[#1e3a5f] px-4 flex-shrink-0">
        {["Overview","Contacts","Hierarchy","Activity"].map(t => (
          <button key={t} className="flex-1 py-2.5 text-[12px] font-semibold border-b-2 transition-all"
            style={{ borderColor: t === "Overview" ? "#6366f1" : "transparent", color: t === "Overview" ? "#818cf8" : "#475569" }}>
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pt-3 pb-24 px-4">

        {/* Primary Action */}
        <div className="mb-3 bg-[#10b98110] border border-[#10b98130] rounded-2xl p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#10b98130] flex items-center justify-center text-[18px] flex-shrink-0">🎯</div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-[13px]">Capture Supply Chain Contact</p>
            <p className="text-[#64748b] text-[11px] mt-0.5">No procurement officer on file</p>
          </div>
          <button className="bg-[#10b981] text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl flex-shrink-0">Go</button>
        </div>

        {/* Pipeline */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[#64748b] text-[11px] font-semibold uppercase tracking-wider">Pipeline ({opps.length})</span>
          <span className="text-[#10b981] text-[11px] font-semibold">+ New Opp</span>
        </div>
        {opps.map(o => (
          <div key={o.title} className="flex items-center gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3.5 py-3 mb-2">
            <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-white text-[12px] font-semibold truncate">{o.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-[#64748b]">{o.stage}</span>
                <div className="flex-1 h-1 bg-[#1e3a5f] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${o.pct}%`, backgroundColor: o.color }} />
                </div>
                <span className="text-[10px] text-[#64748b]">{o.pct}%</span>
              </div>
            </div>
            <span className="text-[#f59e0b] text-[13px] font-bold flex-shrink-0">{o.value}</span>
          </div>
        ))}

        {/* Recent Activity */}
        <div className="flex items-center justify-between mb-2 mt-1">
          <span className="text-[#64748b] text-[11px] font-semibold uppercase tracking-wider">Recent Activity</span>
          <span className="text-[#818cf8] text-[11px] font-semibold">See all</span>
        </div>
        <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl divide-y divide-[#1e3a5f] mb-3">
          {timeline.map((a, i) => (
            <div key={i} className="flex gap-3 p-3">
              <span className="text-[14px]">{a.icon}</span>
              <div>
                <p className="text-white text-[12px]">{a.text}</p>
                <p className="text-[#475569] text-[10px] mt-0.5">{a.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Account Intelligence */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[#64748b] text-[11px] font-semibold uppercase tracking-wider">Account Intelligence</span>
        </div>
        <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl p-3 mb-3">
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-[#64748b]">Health</span>
                <span className="text-[10px] font-bold text-[#10b981]">68%</span>
              </div>
              <div className="h-1.5 bg-[#1e3a5f] rounded-full overflow-hidden">
                <div className="h-full bg-[#10b981] rounded-full" style={{ width: "68%" }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-[#64748b]">Risk</span>
                <span className="text-[10px] font-bold text-[#3b82f6]">Low</span>
              </div>
              <div className="h-1.5 bg-[#1e3a5f] rounded-full overflow-hidden">
                <div className="h-full bg-[#3b82f6] rounded-full" style={{ width: "18%" }} />
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-[#f59e0b18] border border-[#f59e0b33] rounded-xl px-2 py-1">
              <span className="text-[#f59e0b] font-bold text-[14px]">3</span>
              <span className="text-[#f59e0b] text-[9px]">Gaps</span>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2.5 border-t border-[#1e3a5f]">
            <div className="flex items-center gap-1.5 flex-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span className="text-[#475569] text-[10px]">Added <span className="text-[#64748b] font-semibold">May 20, 2026</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span className="text-[10px] font-semibold text-[#818cf8]">via Opportunity Eye</span>
            </div>
          </div>
        </div>

        {/* Deep Intel accordion */}
        <button
          className="w-full flex items-center justify-between py-3 border-t border-[#1e3a5f]"
          onClick={() => setDeepOpen(o => !o)}
        >
          <span className="text-[#64748b] text-[12px] font-semibold">Healthcare Deep Intel</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: deepOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {deepOpen && (
          <div className="space-y-2 mb-3">
            {["CMS Evidence", "Pain Points", "Competitor Landscape", "Entry Strategy"].map(card => (
              <div key={card} className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3.5 py-3 flex items-center justify-between">
                <span className="text-white text-[12px] font-semibold">{card}</span>
                <span className="text-[#6366f1] text-[10px] font-semibold">View →</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2 py-0.5 rounded-full border border-[#1e3a5f]">Overview Tab</span>
      </div>
    </div>
  );
}
