import { useState } from "react";

export function GlobalPlusMenu() {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans relative overflow-hidden">
      {/* Background app screen (dimmed) */}
      <div className="absolute inset-0 bg-[#0a1628]">
        {/* Fake app header */}
        <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-[#1e3a5f]">
          <span className="text-white font-bold text-[17px]">Opportunity OS</span>
          <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
        </div>
        {/* Fake bottom nav */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#0d1f3a] border-t border-[#1e3a5f] flex items-center justify-around px-6">
          {[
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, label: "Home" },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: "Contacts" },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, label: "Orgs" },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, label: "Pipeline" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              {icon}
              <span className="text-[#475569] text-[9px]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Bottom sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#0d1f3a] rounded-t-3xl border-t border-[#1e3a5f] px-5 pt-5 pb-10">
        {/* Handle */}
        <div className="w-10 h-1 bg-[#334155] rounded-full mx-auto mb-5" />

        <p className="text-[#64748b] text-[11px] font-semibold uppercase tracking-widest mb-4">Quick Capture</p>

        {/* Two big feature cards */}
        <div className="flex flex-col gap-3 mb-4">
          {/* Opportunity Eye */}
          <button className="flex items-center gap-4 bg-[#6366f112] border border-[#6366f133] rounded-2xl p-4 text-left">
            <div className="w-14 h-14 rounded-2xl bg-[#6366f120] border border-[#6366f140] flex items-center justify-center flex-shrink-0">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-[15px]">Opportunity Eye</p>
              <p className="text-[#64748b] text-[12px] mt-0.5 leading-snug">Scan a logo or business card to capture an org or contact instantly</p>
              <div className="flex gap-1.5 mt-2">
                {["Logo Scan", "Business Card", "NPI Lookup"].map(t => (
                  <span key={t} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#6366f122] text-[#818cf8]">{t}</span>
                ))}
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          {/* Opportunity Event */}
          <button className="flex items-center gap-4 bg-[#10b98112] border border-[#10b98133] rounded-2xl p-4 text-left relative overflow-hidden">
            <div className="absolute top-2 right-2 bg-[#10b981] text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">NEW</div>
            <div className="w-14 h-14 rounded-2xl bg-[#10b98120] border border-[#10b98140] flex items-center justify-center flex-shrink-0">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-[15px]">Opportunity Event</p>
              <p className="text-[#64748b] text-[12px] mt-0.5 leading-snug">Log what happened — Grok extracts contacts, pipeline changes & next steps</p>
              <div className="flex gap-1.5 mt-2">
                {["Site Visit", "Sales Call", "Event", "Email Thread"].map(t => (
                  <span key={t} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#10b98122] text-[#10b981]">{t}</span>
                ))}
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {/* Separator */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-[#1e3a5f]" />
          <span className="text-[#334155] text-[10px]">or add manually</span>
          <div className="flex-1 h-px bg-[#1e3a5f]" />
        </div>

        {/* Secondary actions row */}
        <div className="flex gap-2">
          {[
            { icon: "👤", label: "New Contact", color: "#3b82f6" },
            { icon: "🏥", label: "New Org", color: "#f59e0b" },
            { icon: "📈", label: "New Deal", color: "#6366f1" },
          ].map(a => (
            <button key={a.label} className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border"
              style={{ backgroundColor: a.color + "0f", borderColor: a.color + "33" }}>
              <span className="text-[18px]">{a.icon}</span>
              <span className="text-[10px] font-semibold" style={{ color: a.color }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
