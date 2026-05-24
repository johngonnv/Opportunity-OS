const contacts = [
  {
    role: "Chief Nursing Officer",
    abbr: "CNO",
    dept: "Administration",
    email: "@mercygeneral.org",
    phone: "(916) 555-0###",
    icon: "👩‍⚕️",
    color: "#8B5CF6",
    reason: "Level I Trauma requires dedicated nursing leadership",
    confidence: 96,
    selected: true,
  },
  {
    role: "VP Supply Chain",
    abbr: "VP-SC",
    dept: "Materials Management",
    email: "@mercygeneral.org",
    phone: "(916) 555-0###",
    icon: "📦",
    color: "#0EA5E9",
    reason: "Trinity Health hospitals use centralized supply chain",
    confidence: 88,
    selected: true,
  },
  {
    role: "Director of Surgical Services",
    abbr: "DSS",
    dept: "Surgery",
    email: "@mercygeneral.org",
    phone: "(916) 555-0###",
    icon: "🔬",
    color: "#10B981",
    reason: "Teaching hospital with active OR program",
    confidence: 82,
    selected: true,
  },
  {
    role: "Chief Medical Officer",
    abbr: "CMO",
    dept: "Administration",
    email: "@mercygeneral.org",
    phone: "(916) 555-0###",
    icon: "🩺",
    color: "#F59E0B",
    reason: "Executive contact for clinical program decisions",
    confidence: 75,
    selected: false,
  },
];

export function GrokContactSuggestions() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18]">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center px-4 pt-14 pb-3 border-b border-[#253048]">
          <div className="flex-1 text-center text-white text-[16px] font-bold">Review Import</div>
        </div>

        {/* Grok banner */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#6366f1]/12 border-b border-[#6366f1]/25">
          <div className="w-5 h-5 rounded bg-[#6366f1] flex items-center justify-center flex-shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <p className="text-[12px] text-[#a5b4fc] font-medium">Grok AI suggested contact roles for this facility</p>
        </div>

        {/* Org context */}
        <div className="px-4 py-2.5 bg-[#111827] border-b border-[#253048] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#253048] flex items-center justify-center flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
          </div>
          <div>
            <p className="text-[13px] font-bold text-white">Mercy General Hospital</p>
            <p className="text-[10px] text-[#64748B]">Level I Trauma · Teaching · 340B · Sacramento, CA</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-2.5" style={{paddingBottom:"140px"}}>
          <p className="text-[11px] text-[#64748B]">Based on facility type and health system, Grok recommends creating these contacts:</p>

          {contacts.map((c, i) => (
            <div key={i} className={`rounded-xl border overflow-hidden ${c.selected ? "border-[#253048] bg-[#111827]" : "border-[#253048]/40 bg-[#111827]/50 opacity-60"}`}>
              <div className="flex items-start gap-3 px-3 py-3">
                {/* Select toggle */}
                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${c.selected ? "bg-[#10B981]/20 border border-[#10B981]" : "border border-[#253048]"}`}>
                  {c.selected && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                </div>

                {/* Avatar */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[16px]" style={{backgroundColor: c.color+"22", border: `1px solid ${c.color}44`}}>
                  {c.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-bold text-white">{c.role}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{backgroundColor: c.color+"25", color: c.color}}>{c.abbr}</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-0.5">{c.dept}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-[#94A3B8] bg-[#253048]/60 px-1.5 py-0.5 rounded">{c.email}</span>
                    <span className="text-[10px] text-[#94A3B8] bg-[#253048]/60 px-1.5 py-0.5 rounded">{c.phone}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className="w-3 h-3 rounded-sm bg-[#6366f1] flex items-center justify-center flex-shrink-0">
                      <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
                    </div>
                    <span className="text-[10px] text-[#64748B] italic flex-1">{c.reason}</span>
                    <span className="text-[10px] font-bold text-[#6366f1] flex-shrink-0">{c.confidence}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <p className="text-[10px] text-[#64748B] text-center">Contact records will be created with blank name fields — fill in names after import</p>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#070D18] border-t border-[#253048] px-4 pt-3 pb-8">
          <div className="flex gap-2 mb-3">
            <button className="flex-1 text-[11px] font-semibold text-[#6366f1] border border-[#6366f1]/30 bg-[#6366f1]/10 rounded-lg py-2.5">Add 3 Contacts</button>
            <button className="flex-1 text-[11px] font-semibold text-[#94A3B8] border border-[#253048] bg-[#111827] rounded-lg py-2.5">Skip</button>
          </div>
          <button className="w-full bg-[#10B981] rounded-xl py-4 flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
            <span className="text-white text-[15px] font-bold">Import 45 Orgs + 3 Contacts</span>
          </button>
        </div>
      </div>
    </div>
  );
}
