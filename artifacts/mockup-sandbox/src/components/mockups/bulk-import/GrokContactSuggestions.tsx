const contacts = [
  {
    role: "Chief Nursing Officer",
    abbr: "CNO",
    dept: "Administration",
    icon: "👩‍⚕️",
    color: "#8B5CF6",
    confidence: 96,
    selected: true,
    webFound: true,
    name: "Dr. Sarah M. Chen, DNP",
    source: "mercygeneral.org/about/leadership",
    sourceType: "website",
    phone: "(916) 453-2200",
    linkedin: "linkedin.com/in/sarahmchen-cno",
    foundDate: "May 2026",
  },
  {
    role: "VP Supply Chain",
    abbr: "VP-SC",
    dept: "Materials Management",
    icon: "📦",
    color: "#0EA5E9",
    confidence: 88,
    selected: true,
    webFound: true,
    name: "Marcus Delgado",
    source: "LinkedIn · Trinity Health",
    sourceType: "linkedin",
    phone: "(916) 453-2345 ext. 4812",
    linkedin: "linkedin.com/in/marcusdelgado-sc",
    foundDate: "Mar 2026",
  },
  {
    role: "Director of Surgical Services",
    abbr: "DSS",
    dept: "Surgery",
    icon: "🔬",
    color: "#10B981",
    confidence: 82,
    selected: true,
    webFound: false,
    name: null,
    source: "Not found in public sources",
    sourceType: "none",
    phone: "(916) 453-2200",
    linkedin: null,
    foundDate: null,
  },
  {
    role: "Chief Medical Officer",
    abbr: "CMO",
    dept: "Administration",
    icon: "🩺",
    color: "#F59E0B",
    confidence: 75,
    selected: false,
    webFound: true,
    name: "Dr. James R. Okafor, MD",
    source: "Press release · Trinity Health, Jan 2026",
    sourceType: "press",
    phone: "(916) 453-2200",
    linkedin: null,
    foundDate: "Jan 2026",
  },
];

const sourceIcon = (type: string) => {
  if (type === "website") return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
  );
  if (type === "linkedin") return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
  );
  if (type === "press") return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
  );
  return null;
};

const sourceColor: Record<string, string> = {
  website: "#10B981",
  linkedin: "#0EA5E9",
  press: "#F59E0B",
  none: "#64748B",
};

export function GrokContactSuggestions() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18]">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center px-4 pt-14 pb-3 border-b border-[#253048]">
          <div className="flex-1 text-center text-white text-[16px] font-bold">Review Import</div>
        </div>

        {/* Grok banner — web enriched */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#6366f1]/12 border-b border-[#6366f1]/25">
          <div className="w-5 h-5 rounded bg-[#6366f1] flex items-center justify-center flex-shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <p className="text-[12px] text-[#a5b4fc] font-medium">Grok found real names via public web &amp; SEO data</p>
          <div className="ml-auto flex items-center gap-1 bg-[#10B981]/15 border border-[#10B981]/30 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            <span className="text-[9px] font-bold text-[#10B981]">3 of 4 found</span>
          </div>
        </div>

        {/* Org context */}
        <div className="px-4 py-2.5 bg-[#111827] border-b border-[#253048] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#253048] flex items-center justify-center flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white">Mercy General Hospital</p>
            <p className="text-[10px] text-[#64748B]">Level I Trauma · Teaching · 340B · Sacramento, CA</p>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[9px] text-[#64748B]">Web searched</span>
            <span className="text-[9px] text-[#10B981] font-bold">Just now</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-2" style={{paddingBottom:"140px"}}>

          {contacts.map((c, i) => (
            <div key={i} className={`rounded-xl border overflow-hidden transition-opacity ${c.selected ? "border-[#253048] bg-[#111827]" : "border-[#253048]/40 bg-[#111827]/40 opacity-55"}`}>
              <div className="flex items-start gap-2.5 px-3 py-2.5">
                {/* Checkbox */}
                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${c.selected ? "bg-[#10B981]/20 border border-[#10B981]" : "border border-[#253048]"}`}>
                  {c.selected && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                </div>

                {/* Avatar */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[15px]" style={{backgroundColor: c.color+"22", border: `1px solid ${c.color}44`}}>
                  {c.icon}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Role + badge */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] font-bold text-white">{c.role}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{backgroundColor: c.color+"25", color: c.color}}>{c.abbr}</span>
                  </div>
                  <p className="text-[10px] text-[#64748B] mt-0.5">{c.dept}</p>

                  {/* Web-found name */}
                  {c.webFound && c.name ? (
                    <div className="mt-1.5 rounded-lg border border-[#10B981]/25 bg-[#10B981]/08 px-2 py-1.5">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20"/></svg>
                        <span className="text-[9px] font-bold text-[#10B981] uppercase tracking-wide">Found online</span>
                        <span className="text-[9px] text-[#64748B] ml-auto">{c.foundDate}</span>
                      </div>
                      <p className="text-[12px] font-semibold text-white">{c.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[#10B981]" style={{color: sourceColor[c.sourceType]}}>
                          {sourceIcon(c.sourceType)}
                        </span>
                        <span className="text-[10px] truncate" style={{color: sourceColor[c.sourceType]}}>{c.source}</span>
                      </div>
                    </div>
                  ) : c.webFound === false ? (
                    <div className="mt-1.5 rounded-lg border border-[#253048] bg-[#0d1120] px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        <span className="text-[10px] text-[#64748B]">{c.source}</span>
                      </div>
                      <p className="text-[10px] text-[#94A3B8] mt-0.5">Office main line pre-filled from facility record</p>
                    </div>
                  ) : null}

                  {/* Phone */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <div className="flex items-center gap-1 bg-[#253048]/50 rounded px-1.5 py-0.5">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.01 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                      <span className="text-[9px] text-[#94A3B8]">{c.phone}</span>
                    </div>
                    {c.linkedin && (
                      <div className="flex items-center gap-1 bg-[#0EA5E9]/15 border border-[#0EA5E9]/25 rounded px-1.5 py-0.5">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="#0EA5E9"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2" fill="#0EA5E9"/></svg>
                        <span className="text-[9px] text-[#0EA5E9]">LinkedIn</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <p className="text-[10px] text-[#64748B] text-center mt-1">Names pre-filled from public sources · always verify before outreach</p>
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
