const rows = [
  { name: "Mercy General Hospital", type: "HOSPITAL", city: "Sacramento", state: "CA", status: "ready" },
  { name: "Dignity Health – Mercy Med Ctr", type: "HOSPITAL", city: "Redding", state: "CA", status: "ready" },
  { name: "St. Mary's Medical Center", type: "HOSPITAL", city: "San Francisco", state: "CA", status: "ready" },
];

export function GrokHierarchy() {
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
          <p className="text-[12px] text-[#a5b4fc] font-medium">Grok AI detected org hierarchies — tap a row to expand</p>
        </div>

        <div className="flex-1 overflow-auto flex flex-col gap-0" style={{paddingBottom:"130px"}}>
          {/* Row 1 — expanded with hierarchy */}
          <div className="border-b border-[#253048]">
            <div className="flex items-start gap-2.5 px-4 py-3 bg-[#6366f1]/08">
              <div className="w-4 h-4 rounded bg-[#10B981]/20 border border-[#10B981] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-white">Mercy General Hospital</span>
                  <span className="text-[9px] bg-[#10B981]/20 text-[#10B981] font-bold px-1.5 py-0.5 rounded">ready</span>
                </div>
                <p className="text-[11px] text-[#64748B] mt-0.5">Hospital · Sacramento, CA</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" className="mt-1 flex-shrink-0"><polyline points="18,15 12,9 6,15"/></svg>
            </div>

            {/* Hierarchy suggestion */}
            <div className="mx-4 mb-3 rounded-xl border border-[#6366f1]/30 bg-[#0d1120] overflow-hidden">
              <div className="px-3 py-2 border-b border-[#6366f1]/20 flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-[#6366f1] flex items-center justify-center flex-shrink-0">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
                </div>
                <span className="text-[11px] font-bold text-[#a5b4fc]">Grok: Org Hierarchy Detected</span>
                <span className="ml-auto text-[10px] text-[#6366f1] bg-[#6366f1]/15 px-1.5 py-0.5 rounded font-semibold">94% confident</span>
              </div>
              <div className="px-3 py-2.5 flex flex-col gap-1.5">
                {/* Tree */}
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-[#7C3AED]/25 border border-[#7C3AED]/50 flex items-center justify-center flex-shrink-0">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/></svg>
                  </div>
                  <span className="text-[12px] text-white font-semibold">Trinity Health</span>
                  <span className="text-[10px] text-[#64748B]">Health System</span>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <div className="w-px h-4 bg-[#253048] absolute ml-[-8px]" />
                  <div className="w-3 h-px bg-[#253048]" />
                  <div className="w-5 h-5 rounded bg-[#2563EB]/20 border border-[#2563EB]/40 flex items-center justify-center flex-shrink-0">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  </div>
                  <span className="text-[12px] text-[#93c5fd] font-medium">Mercy Health – West</span>
                  <span className="text-[10px] text-[#64748B]">Region</span>
                </div>
                <div className="flex items-center gap-2 ml-8">
                  <div className="w-3 h-px bg-[#253048]" />
                  <div className="w-5 h-5 rounded bg-[#0F766E]/25 border border-[#0F766E]/50 flex items-center justify-center flex-shrink-0">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                  </div>
                  <span className="text-[12px] text-[#6ee7b7] font-bold">Mercy General Hospital</span>
                  <span className="text-[9px] text-[#10B981] bg-[#10B981]/15 px-1 rounded font-bold">THIS ROW</span>
                </div>
              </div>
              <div className="px-3 py-2 border-t border-[#253048]/60 flex gap-2">
                <button className="flex-1 text-[11px] font-semibold text-[#6366f1] bg-[#6366f1]/10 rounded-lg py-1.5">Apply Hierarchy</button>
                <button className="flex-1 text-[11px] font-semibold text-[#64748B] bg-[#111827] rounded-lg py-1.5">Dismiss</button>
              </div>
            </div>
          </div>

          {/* Rows 2 & 3 — collapsed */}
          {rows.slice(1).map((row, i) => (
            <div key={i} className="flex items-start gap-2.5 px-4 py-3 border-b border-[#253048]">
              <div className="w-4 h-4 rounded bg-[#10B981]/20 border border-[#10B981] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-white">{row.name}</span>
                  <span className="text-[9px] bg-[#10B981]/20 text-[#10B981] font-bold px-1.5 py-0.5 rounded">ready</span>
                </div>
                <p className="text-[11px] text-[#64748B] mt-0.5">Hospital · {row.city}, {row.state}</p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-3 h-3 rounded bg-[#6366f1] flex items-center justify-center flex-shrink-0">
                    <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
                  </div>
                  <span className="text-[10px] text-[#6366f1] font-medium">Hierarchy detected — tap to view</span>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#253048" strokeWidth="2" className="mt-1 flex-shrink-0"><polyline points="6,9 12,15 18,9"/></svg>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#070D18] border-t border-[#253048] px-4 pt-3 pb-8">
          <div className="flex gap-2 mb-3">
            <button className="flex-1 flex items-center justify-center gap-1 border border-[#6366f1]/30 rounded-lg py-2.5 bg-[#6366f1]/10">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
              <span className="text-[11px] font-semibold text-[#6366f1]">Apply All Hierarchies</span>
            </button>
            <button className="flex-1 border border-[#253048] rounded-lg py-2.5 bg-[#111827]">
              <span className="text-[11px] font-semibold text-[#94A3B8]">Skip</span>
            </button>
          </div>
          <button className="w-full bg-[#10B981] rounded-xl py-4 flex items-center justify-center gap-2">
            <span className="text-white text-[15px] font-bold">Import 45 Records</span>
          </button>
        </div>
      </div>
    </div>
  );
}
