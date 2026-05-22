import { useState } from "react";

type Mode = "card" | "logo" | "qr";

const modes: { id: Mode; icon: React.ReactNode; label: string; sub: string; color: string; bg: string }[] = [
  {
    id: "card", label: "Business Card", sub: "OCR → contact form pre-fill",
    color: "#10b981", bg: "#10b98118",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>
      </svg>
    ),
  },
  {
    id: "logo", label: "Facility / Logo", sub: "Logo → NPI match → hierarchy",
    color: "#6366f1", bg: "#6366f118",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    id: "qr", label: "Badge / QR", sub: "Conference badge instant import",
    color: "#f59e0b", bg: "#f59e0b18",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3" rx="0.5"/>
        <rect x="18" y="14" width="3" height="3" rx="0.5"/><rect x="14" y="18" width="3" height="3" rx="0.5"/>
        <rect x="18" y="18" width="3" height="3" rx="0.5"/>
      </svg>
    ),
  },
];

const recentScans = [
  { label: "Memorial Health System", sub: "Logo scan · 3 min ago", mode: "logo", status: "Matched", statusColor: "#10b981" },
  { label: "Savannah Specialty Clinic", sub: "Logo scan · 22 min ago", mode: "logo", status: "Pending", statusColor: "#f59e0b" },
  { label: "Dr. Angela Torres · MHS", sub: "Card scan · 2 hr ago", mode: "card", status: "Imported", statusColor: "#6366f1" },
];

export function OpportunityEye() {
  const [active, setActive] = useState<Mode>("card");
  const mode = modes.find(m => m.id === active)!;

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans">
      <div className="px-5 pt-14 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span className="text-white font-bold text-[20px] tracking-tight">Opportunity Eye</span>
            </div>
            <p className="text-[#64748b] text-[12px] mt-0.5">Unified capture · scan anything</p>
          </div>
          <button className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <div className="flex gap-2 mt-5">
          {modes.map(m => (
            <button key={m.id} onClick={() => setActive(m.id)}
              className="flex-1 flex flex-col items-center gap-1.5 rounded-2xl border py-3 px-2 transition-all"
              style={{ backgroundColor: active === m.id ? m.bg : "#0d2040", borderColor: active === m.id ? m.color + "66" : "#1e3a5f", color: active === m.id ? m.color : "#64748b" }}>
              {m.icon}
              <span className="text-[11px] font-semibold leading-tight text-center">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-5">
        <div className="relative w-full rounded-3xl overflow-hidden flex items-center justify-center"
          style={{ height: 220, backgroundColor: "#050e1e", border: `2px solid ${mode.color}33` }}>
          {[["top-3 left-3"], ["top-3 right-3"], ["bottom-3 left-3"], ["bottom-3 right-3"]].map(([pos], i) => (
            <div key={i} className={`absolute ${pos} w-6 h-6`}
              style={{ borderTop: i < 2 ? `2px solid ${mode.color}` : "none", borderBottom: i >= 2 ? `2px solid ${mode.color}` : "none", borderLeft: i % 2 === 0 ? `2px solid ${mode.color}` : "none", borderRight: i % 2 === 1 ? `2px solid ${mode.color}` : "none" }} />
          ))}
          <div className="absolute inset-x-6 h-px opacity-60" style={{ backgroundColor: mode.color, top: "45%" }} />
          <div className="flex flex-col items-center gap-3 opacity-40" style={{ color: mode.color }}>
            {mode.icon}
            <span className="text-[11px] font-medium">{mode.sub}</span>
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <button className="w-14 h-14 rounded-full border-4 border-white/20 flex items-center justify-center" style={{ backgroundColor: mode.color }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
          </div>
        </div>
        <div className="flex gap-2 mt-2.5">
          {["Library","Manual","History"].map((a,i) => (
            <button key={a} className="flex-1 flex items-center justify-center gap-2 bg-[#0d2040] border border-[#1e3a5f] rounded-xl py-2.5 text-[#94a3b8] text-[12px] font-medium">
              {i===0?"📁":i===1?"✏️":"🕐"} {a}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 mt-4 flex-1 overflow-y-auto">
        <p className="text-[#64748b] text-[11px] font-semibold uppercase tracking-wider mb-2">Recent Scans</p>
        <div className="flex flex-col gap-2">
          {recentScans.map((s, i) => (
            <div key={i} className="flex items-center gap-3 bg-[#0d2040] border border-[#1e3a5f] rounded-xl px-3.5 py-3">
              <div className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center flex-shrink-0 text-[16px]">
                {s.mode === "card" ? "👤" : "🏥"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[13px] font-semibold truncate">{s.label}</p>
                <p className="text-[#64748b] text-[11px]">{s.sub}</p>
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: s.statusColor, backgroundColor: s.statusColor + "20" }}>{s.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center py-3">
        <span className="text-[10px] text-[#475569] font-mono bg-[#1e293b] px-3 py-1 rounded-full">/(capture)/opportunity-eye</span>
      </div>
    </div>
  );
}
