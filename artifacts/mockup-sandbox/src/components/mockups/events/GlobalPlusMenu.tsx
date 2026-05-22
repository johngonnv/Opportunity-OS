import { useState } from "react";

export function GlobalPlusMenu() {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<"before" | "after">("after");

  const menuItems = view === "after"
    ? [
        {
          key: "event",
          icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          ),
          iconBg: "#10b98120", iconBorder: "#10b98140",
          border: "#10b98133", bg: "#10b98112",
          title: "Opportunity Event",
          desc: "Log what happened — Grok extracts contacts, pipeline changes & next steps",
          tags: ["Site Visit", "Sales Call", "Event", "Email Thread"],
          tagColor: "#10b981",
          badge: "NEW",
        },
        {
          key: "eye",
          icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          ),
          iconBg: "#6366f120", iconBorder: "#6366f140",
          border: "#6366f133", bg: "#6366f112",
          title: "Opportunity Eye",
          desc: "Scan a logo or business card to capture an org or contact instantly",
          tags: ["Logo Scan", "Business Card", "NPI Lookup"],
          tagColor: "#818cf8",
          badge: null,
        },
      ]
    : [
        {
          key: "eye",
          icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          ),
          iconBg: "#6366f120", iconBorder: "#6366f140",
          border: "#6366f133", bg: "#6366f112",
          title: "Opportunity Eye",
          desc: "Scan a logo or business card to capture an org or contact instantly",
          tags: ["Logo Scan", "Business Card", "NPI Lookup"],
          tagColor: "#818cf8",
          badge: null,
        },
        {
          key: "event",
          icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          ),
          iconBg: "#10b98120", iconBorder: "#10b98140",
          border: "#10b98133", bg: "#10b98112",
          title: "Opportunity Event",
          desc: "Log what happened — Grok extracts contacts, pipeline changes & next steps",
          tags: ["Site Visit", "Sales Call", "Event", "Email Thread"],
          tagColor: "#10b981",
          badge: "NEW",
        },
      ];

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans relative overflow-hidden">
      {/* Before/After toggle — sits above the sheet for demo purposes */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl p-0.5 gap-0.5">
        {(["before", "after"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="px-3 py-1 rounded-lg text-[10px] font-bold capitalize transition-all"
            style={{ backgroundColor: view === v ? "#6366f1" : "transparent", color: view === v ? "white" : "#475569" }}>
            {v === "before" ? "Before (Eye first)" : "After (Event first)"}
          </button>
        ))}
      </div>

      {/* Background app (dimmed) */}
      <div className="absolute inset-0 bg-[#0a1628]">
        <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-[#1e3a5f]">
          <span className="text-white font-bold text-[17px]">Opportunity OS</span>
          <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#0d1f3a] border-t border-[#1e3a5f] flex items-center justify-around px-6">
          {["Home","Contacts","Orgs","Pipeline"].map(label => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <div className="w-4 h-4 bg-[#1e3a5f] rounded" />
              <span className="text-[#475569] text-[9px]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Bottom sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#0d1f3a] rounded-t-3xl border-t border-[#1e3a5f] px-5 pt-5 pb-10">
        <div className="w-10 h-1 bg-[#334155] rounded-full mx-auto mb-5" />
        <p className="text-[#64748b] text-[11px] font-semibold uppercase tracking-widest mb-4">Quick Capture</p>

        <div className="flex flex-col gap-3 mb-4">
          {menuItems.map(item => (
            <button key={item.key}
              className="flex items-center gap-4 rounded-2xl p-4 text-left relative overflow-hidden border"
              style={{ backgroundColor: item.bg, borderColor: item.border }}>
              {item.badge && (
                <div className="absolute top-2 right-2 bg-[#10b981] text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </div>
              )}
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border"
                style={{ backgroundColor: item.iconBg, borderColor: item.iconBorder }}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-[15px]">{item.title}</p>
                <p className="text-[#64748b] text-[12px] mt-0.5 leading-snug">{item.desc}</p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {item.tags.map(t => (
                    <span key={t} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: item.tagColor + "22", color: item.tagColor }}>{t}</span>
                  ))}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-[#1e3a5f]" />
          <span className="text-[#334155] text-[10px]">or add manually</span>
          <div className="flex-1 h-px bg-[#1e3a5f]" />
        </div>

        <div className="flex gap-2">
          {[
            { icon: "👤", label: "New Contact", color: "#3b82f6" },
            { icon: "🏥", label: "New Org",     color: "#f59e0b" },
            { icon: "📈", label: "New Deal",    color: "#6366f1" },
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
