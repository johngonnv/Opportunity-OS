const tags = [
  { label: "Trauma Level I", color: "#EF4444", bg: "#EF444420", icon: "🏥", conf: 97 },
  { label: "Teaching Hospital", color: "#8B5CF6", bg: "#8B5CF620", icon: "🎓", conf: 91 },
  { label: "340B Drug Pricing", color: "#0EA5E9", bg: "#0EA5E920", icon: "💊", conf: 89 },
  { label: "MAGNET Nursing", color: "#F59E0B", bg: "#F59E0B20", icon: "⭐", conf: 82 },
  { label: "Joint Commission", color: "#10B981", bg: "#10B98120", icon: "✅", conf: 96 },
  { label: "CMS 5-Star", color: "#6366f1", bg: "#6366f120", icon: "🌟", conf: 78 },
];

const typeOptions = ["HOSPITAL", "HEALTH_SYSTEM", "AMBULATORY_SURGERY", "SKILLED_NURSING", "PHYSICIAN_GROUP", "IMAGING_CENTER", "RURAL_HEALTH"];

export function GrokFacilityTags() {
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
          <p className="text-[12px] text-[#a5b4fc] font-medium">Grok AI enriched facility types + compliance tags</p>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-4" style={{paddingBottom:"130px"}}>
          {/* Row card — expanded */}
          <div className="rounded-xl border border-[#6366f1]/35 bg-[#0d1120] overflow-hidden">
            <div className="flex items-start gap-2.5 px-3 py-3 border-b border-[#253048]/60">
              <div className="w-4 h-4 rounded bg-[#10B981]/20 border border-[#10B981] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-white">Mercy General Hospital</p>
                <p className="text-[11px] text-[#64748B]">Sacramento, CA</p>
              </div>
            </div>

            {/* Facility Type */}
            <div className="px-3 py-2.5 border-b border-[#253048]/60">
              <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Facility Type</p>
              <div className="flex flex-wrap gap-1.5">
                {typeOptions.map(t => (
                  <button key={t} className={`text-[10px] font-semibold px-2 py-1 rounded-lg border ${t === "HOSPITAL" ? "bg-[#6366f1] border-[#6366f1] text-white" : "border-[#253048] bg-[#111827] text-[#64748B]"}`}>
                    {t.replace(/_/g," ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Grok tags */}
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Grok-Suggested Tags</p>
                <span className="text-[9px] text-[#6366f1] bg-[#6366f1]/15 px-1.5 py-0.5 rounded font-bold">AI</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {tags.map(tag => (
                  <div key={tag.label} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{backgroundColor: tag.bg, border: `1px solid ${tag.color}35`}}>
                    <span className="text-[12px]">{tag.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold leading-tight" style={{color: tag.color}}>{tag.label}</p>
                      <p className="text-[10px] text-[#64748B]">{tag.conf}% match</p>
                    </div>
                    {/* Checkbox to include */}
                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${tag.conf > 85 ? "bg-[#10B981]/25 border border-[#10B981]" : "border border-[#253048]"}`}>
                      {tag.conf > 85 && <svg width="7" height="5" viewBox="0 0 7 5" fill="none"><path d="M1 2.5l1.5 1.5 3.5-3.5" stroke="#10B981" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action row */}
            <div className="px-3 py-2.5 border-t border-[#253048]/60 bg-[#070D18]/50 flex gap-2">
              <button className="flex-1 text-[11px] font-semibold text-[#6366f1] bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-lg py-2">Apply to This Row</button>
              <button className="flex-1 text-[11px] font-semibold text-[#94A3B8] bg-[#111827] border border-[#253048] rounded-lg py-2">Apply to All</button>
            </div>
          </div>

          {/* Info card */}
          <div className="flex items-start gap-2.5 bg-[#111827] border border-[#253048] rounded-xl px-3 py-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p className="text-[12px] text-[#94A3B8] leading-relaxed">Tags are used for filtering, sales playbooks, and automated opportunity scoring in Opportunity OS.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#070D18] border-t border-[#253048] px-4 pt-3 pb-8">
          <button className="w-full bg-[#10B981] rounded-xl py-4 flex items-center justify-center gap-2">
            <span className="text-white text-[15px] font-bold">Apply Tags + Continue</span>
          </button>
        </div>
      </div>
    </div>
  );
}
