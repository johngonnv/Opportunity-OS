export function CurrentCardScan() {
  return (
    <div className="flex flex-col h-screen bg-[#0a1628] px-6 justify-between pb-8 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 pt-14 pb-2">
        <div className="w-8 h-8 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <span className="text-white font-semibold text-[17px]">Scan Business Card</span>
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
        <div className="w-24 h-24 rounded-full bg-[#10b98122] flex items-center justify-center mb-2">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
        </div>
        <p className="text-white font-bold text-[22px] text-center leading-tight">Scan a Business Card</p>
        <p className="text-[#94a3b8] text-[14px] text-center leading-relaxed max-w-[280px]">
          Take a clear photo of the front of the business card. OCR will pre-fill the contact form.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 pb-2">
        <button className="flex items-center justify-center gap-2.5 bg-[#10b981] rounded-[14px] py-4 text-white font-semibold text-[16px]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Take Photo
        </button>
        <button className="flex items-center justify-center gap-2.5 bg-[#10b98118] border border-[#10b98155] rounded-[14px] py-4 text-[#10b981] font-semibold text-[16px]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Pick from Library
        </button>
      </div>

      {/* Route badge */}
      <div className="flex justify-center pt-3">
        <span className="text-[10px] text-[#475569] font-mono bg-[#1e293b] px-3 py-1 rounded-full">/capture/scan-card</span>
      </div>
    </div>
  );
}
