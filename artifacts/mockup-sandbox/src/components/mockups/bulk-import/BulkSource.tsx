export function BulkSource() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18] font-['Inter']">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden relative" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center gap-3 px-4 pt-14 pb-4 border-b border-[#253048]">
          <div className="text-[#6366f1] text-sm font-semibold">← Capture</div>
          <div className="flex-1 text-center text-white text-[17px] font-bold tracking-tight">Bulk Import</div>
          <div className="w-14" />
        </div>

        <div className="flex-1 overflow-auto px-4 py-4 flex flex-col gap-5">
          <p className="text-[#64748B] text-[13px] leading-relaxed">Upload a CSV or Excel file. Grok AI will intelligently map columns to the CRM.</p>

          {/* Import type */}
          <div>
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest mb-2">Import Type</p>
            <div className="flex gap-3">
              {/* Organizations - ACTIVE */}
              <div className="flex-1 rounded-xl border-2 border-[#6366f1] bg-[#6366f1]/10 p-4 flex flex-col items-center gap-2 relative">
                <div className="absolute top-2 right-2">
                  <div className="w-4 h-4 rounded-full bg-[#6366f1] flex items-center justify-center">
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
                </div>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                  <polyline points="9,22 9,12 15,12 15,22"/>
                </svg>
                <span className="text-white text-[12px] font-semibold text-center leading-tight">Organizations<br/>/ Facilities</span>
              </div>
              {/* Contacts */}
              <div className="flex-1 rounded-xl border border-[#253048] bg-[#111827] p-4 flex flex-col items-center gap-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.8">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
                <span className="text-[#94A3B8] text-[12px] font-semibold text-center leading-tight">Contacts</span>
              </div>
            </div>
          </div>

          {/* File upload zone */}
          <div>
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest mb-2">File</p>
            <div className="border-2 border-dashed border-[#6366f1]/40 rounded-xl p-6 flex flex-col items-center gap-3 bg-[#111827]">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
                <polyline points="16,16 12,12 8,16"/>
                <line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
              </svg>
              <div className="text-center">
                <p className="text-[15px] font-semibold text-white">Tap to browse</p>
                <p className="text-[12px] text-[#64748B] mt-1">CSV or Excel (.xlsx) · Max 10 MB · Up to 500 rows</p>
              </div>
            </div>
          </div>

          {/* Template row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span className="text-[12px] text-[#64748B]">Download template:</span>
            <span className="text-[12px] text-[#6366f1] font-semibold">Organizations</span>
            <span className="text-[12px] text-[#64748B]">·</span>
            <span className="text-[12px] text-[#6366f1] font-semibold">Contacts</span>
          </div>

          {/* CTA */}
          <div className="bg-[#6366f1]/20 border border-[#6366f1]/30 rounded-xl px-4 py-3 flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p className="text-[12px] text-[#94A3B8]">Upload your facility list. Grok will auto-map columns like <span className="text-white font-medium">"Hosp Name"</span>, <span className="text-white font-medium">"Address 1"</span>, etc.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 pb-8 pt-3 border-t border-[#253048]">
          <button className="w-full bg-[#253048] rounded-xl py-4 flex items-center justify-center gap-2 opacity-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <span className="text-white text-[15px] font-bold">Analyze with Grok AI</span>
          </button>
          <p className="text-center text-[11px] text-[#64748B] mt-2">Select a file to continue</p>
        </div>
      </div>
    </div>
  );
}
