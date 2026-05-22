export function CurrentOrgScan() {
  const candidates = [
    { name: "Lockheed Martin Corp", addr: "6801 Rockledge Dr, Bethesda, MD", confidence: 94, cat: "Defense" },
    { name: "Lockheed Martin Space", addr: "1011 Sunset Blvd, Littleton, CO", confidence: 78, cat: "Aerospace" },
    { name: "LM Wind Power", addr: "4400 N. First St, Little Rock, AR", confidence: 61, cat: "Energy" },
  ];
  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-3 border-b border-[#1e3a5f]">
        <div className="w-8 h-8 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <div>
          <p className="text-white font-semibold text-[16px]">Logo Scan</p>
          <p className="text-[#94a3b8] text-[11px]">Opportunity #1042</p>
        </div>
      </div>

      {/* Logo preview area */}
      <div className="mx-5 mt-4 rounded-2xl border border-[#1e3a5f] bg-[#0d2040] p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-[#1e3a5f] flex items-center justify-center flex-shrink-0">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-[14px]">lockheed_logo.jpg</p>
          <p className="text-[#10b981] text-[12px] mt-0.5">Parsed — OCR complete</p>
          <p className="text-[#64748b] text-[11px] mt-0.5 font-mono">confidence: 94%</p>
        </div>
        <div className="w-6 h-6 rounded-full bg-[#10b98133] flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>

      {/* Places candidates */}
      <div className="px-5 mt-4 flex-1 overflow-y-auto">
        <p className="text-[#94a3b8] text-[11px] font-semibold uppercase tracking-wider mb-2">Place Candidates</p>
        <div className="flex flex-col gap-2">
          {candidates.map((c, i) => (
            <div key={i} className={`rounded-xl border p-3.5 ${i === 0 ? "border-[#10b98155] bg-[#10b98108]" : "border-[#1e3a5f] bg-[#0d2040]"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-[13px] leading-tight">{c.name}</p>
                  <p className="text-[#64748b] text-[11px] mt-0.5 leading-tight">{c.addr}</p>
                  <span className="inline-block mt-1.5 text-[10px] bg-[#1e3a5f] text-[#94a3b8] px-2 py-0.5 rounded-full">{c.cat}</span>
                </div>
                <div className={`text-[12px] font-bold px-2 py-0.5 rounded-lg flex-shrink-0 ${c.confidence > 85 ? "text-[#10b981] bg-[#10b98120]" : c.confidence > 70 ? "text-[#f59e0b] bg-[#f59e0b20]" : "text-[#64748b] bg-[#1e3a5f]"}`}>
                  {c.confidence}%
                </div>
              </div>
              {i === 0 && (
                <div className="flex gap-2 mt-2.5">
                  <button className="flex-1 bg-[#10b981] text-white text-[12px] font-semibold py-1.5 rounded-lg">Approve</button>
                  <button className="flex-1 bg-[#1e3a5f] text-[#94a3b8] text-[12px] font-semibold py-1.5 rounded-lg">Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Manual fallback */}
        <button className="w-full mt-3 flex items-center justify-center gap-2 border border-dashed border-[#1e3a5f] rounded-xl py-3 text-[#64748b] text-[13px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Enter address manually
        </button>
      </div>

      {/* Route badge */}
      <div className="flex justify-center py-3">
        <span className="text-[10px] text-[#475569] font-mono bg-[#1e293b] px-3 py-1 rounded-full">/org-scan/[id]</span>
      </div>
    </div>
  );
}
