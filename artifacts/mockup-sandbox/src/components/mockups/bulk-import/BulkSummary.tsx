export function BulkSummary() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18]">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center px-4 pt-14 pb-4 border-b border-[#253048]">
          <div className="flex-1 text-center text-white text-[17px] font-bold">Import Complete</div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-7">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-[#10B981]/15 border border-[#10B981]/40 flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.8">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
              <polyline points="22,4 12,14.01 9,11.01"/>
            </svg>
          </div>

          <div className="text-center">
            <h2 className="text-white text-[24px] font-black tracking-tight">Import Complete!</h2>
            <p className="text-[#94A3B8] text-[14px] mt-1">Organizations have been added to your CRM</p>
          </div>

          {/* Stats */}
          <div className="flex gap-6">
            <div className="text-center">
              <span className="text-[32px] font-black text-[#10B981]">40</span>
              <p className="text-[12px] text-[#64748B] mt-0.5">Created</p>
            </div>
            <div className="w-px bg-[#253048]" />
            <div className="text-center">
              <span className="text-[32px] font-black text-[#F59E0B]">3</span>
              <p className="text-[12px] text-[#64748B] mt-0.5">Already existed</p>
            </div>
            <div className="w-px bg-[#253048]" />
            <div className="text-center">
              <span className="text-[32px] font-black text-[#EF4444]">2</span>
              <p className="text-[12px] text-[#64748B] mt-0.5">Errors</p>
            </div>
          </div>

          {/* Duplicate info */}
          <div className="w-full bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-4 py-3 flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" className="mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p className="text-[12px] text-[#94A3B8]">3 records already existed and were skipped: <span className="text-[#F59E0B] font-medium">Mercy General Hospital, HCA Sunrise, ValleyCare</span></p>
          </div>

          {/* Error details */}
          <div className="w-full bg-[#111827] border border-[#253048] rounded-xl px-4 py-3">
            <p className="text-[11px] font-bold text-[#EF4444] mb-2">Issues (2 rows)</p>
            <p className="text-[12px] text-[#94A3B8]">• Row 23: Name is required</p>
            <p className="text-[12px] text-[#94A3B8] mt-1">• Row 41: Invalid state code "Cal"</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-10 pt-3 flex flex-col gap-3">
          <button className="w-full bg-[#10B981] rounded-xl py-4 flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span className="text-white text-[15px] font-bold">View Organizations</span>
          </button>
          <button className="w-full border border-[#253048] rounded-xl py-3 flex items-center justify-center gap-2">
            <span className="text-[#6366f1] text-[14px] font-semibold">Import Another File</span>
          </button>
        </div>
      </div>
    </div>
  );
}
