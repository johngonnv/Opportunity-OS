export function PostImportSuccess() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18]">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center px-4 pt-14 pb-4 border-b border-[#253048]">
          <div className="flex-1 text-center text-white text-[17px] font-bold">Import Complete</div>
        </div>

        <div className="flex-1 flex flex-col px-5 py-5 gap-4">
          {/* Hero success block */}
          <div className="flex flex-col items-center pt-4 pb-5 gap-3">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-[#10B981]/15 border border-[#10B981]/40 flex items-center justify-center">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.8">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                  <polyline points="22,4 12,14.01 9,11.01"/>
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#6366f1] flex items-center justify-center border-2 border-[#070D18]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-white text-[22px] font-black tracking-tight">45 Records Imported!</h2>
              <p className="text-[#64748B] text-[13px] mt-1">Grok enriched all orgs with verified data</p>
            </div>
          </div>

          {/* Stat cards row */}
          <div className="flex gap-2.5">
            {[
              { num: "40", label: "Orgs added", color: "#10B981" },
              { num: "3", label: "Contacts added", color: "#6366f1" },
              { num: "2", label: "Skipped", color: "#F59E0B" },
            ].map((s, i) => (
              <div key={i} className="flex-1 bg-[#111827] border border-[#253048] rounded-xl px-2 py-3 flex flex-col items-center gap-1">
                <span className="text-[22px] font-black" style={{color: s.color}}>{s.num}</span>
                <span className="text-[10px] text-[#64748B] text-center leading-tight">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Grok enrichment summary */}
          <div className="bg-[#6366f1]/10 border border-[#6366f1]/25 rounded-xl px-4 py-3 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#6366f1] flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-bold text-[#a5b4fc]">Grok enriched each org</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                {["Facility addresses", "Main phone numbers", "NPI numbers verified", "Contact names from web"].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>
                    <span className="text-[10px] text-[#94A3B8]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Skipped notice */}
          <div className="bg-[#F59E0B]/08 border border-[#F59E0B]/25 rounded-xl px-4 py-3 flex items-start gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>
              <p className="text-[11px] font-semibold text-[#F59E0B]">2 rows skipped</p>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">Row 23 missing name · Row 41 invalid state code</p>
              <button className="text-[10px] text-[#F59E0B] font-semibold mt-1 underline">Fix &amp; re-import →</button>
            </div>
          </div>

          {/* Notify team */}
          <div className="bg-[#111827] border border-[#253048] rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="flex -space-x-2">
              {["#8B5CF6","#10B981","#0EA5E9"].map((c, i) => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-[#111827] flex items-center justify-center" style={{backgroundColor: c+"33", borderColor:"#111827"}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
              ))}
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-white">Notify your team</p>
              <p className="text-[10px] text-[#64748B]">3 reps in your territory</p>
            </div>
            <button className="text-[11px] font-bold text-[#6366f1] border border-[#6366f1]/30 bg-[#6366f1]/10 rounded-lg px-3 py-1.5">Send</button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 pb-10 pt-2 flex flex-col gap-2.5">
          <button className="w-full bg-[#10B981] rounded-xl py-4 flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span className="text-white text-[15px] font-bold">Start Working Records</span>
          </button>
          <button className="w-full border border-[#253048] rounded-xl py-3 flex items-center justify-center gap-2">
            <span className="text-[#64748B] text-[13px] font-semibold">Import Another File</span>
          </button>
        </div>
      </div>
    </div>
  );
}
