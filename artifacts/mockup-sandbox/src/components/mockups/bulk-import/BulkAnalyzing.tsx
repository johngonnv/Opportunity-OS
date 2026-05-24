export function BulkAnalyzing() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18] font-['Inter']">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center px-4 pt-14 pb-4 border-b border-[#253048]">
          <div className="flex-1 text-center text-white text-[17px] font-bold tracking-tight">Bulk Import</div>
        </div>

        {/* Step bar */}
        <div className="flex items-center gap-0 px-4 py-3 bg-[#111827] border-b border-[#253048]">
          {[
            { label: "Select File", done: true },
            { label: "Analyzing", done: false, active: true },
            { label: "Review", done: false },
            { label: "Done", done: false },
          ].map((step, i, arr) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  step.done ? "bg-[#10B981] text-white" : step.active ? "bg-[#6366f1] text-white ring-2 ring-[#6366f1]/30" : "bg-[#253048] text-[#64748B]"
                }`}>
                  {step.done ? (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5l2.5 2.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  ) : i + 1}
                </div>
                <span className={`text-[9px] mt-0.5 font-semibold ${step.active ? "text-[#6366f1]" : step.done ? "text-[#10B981]" : "text-[#64748B]"}`}>{step.label}</span>
              </div>
              {i < arr.length - 1 && (
                <div className={`h-[1px] w-4 -mt-4 ${step.done ? "bg-[#10B981]" : "bg-[#253048]"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Main progress area */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
          {/* Grok logo / pulse ring */}
          <div className="relative flex items-center justify-center">
            <div className="absolute w-24 h-24 rounded-full border-2 border-[#6366f1]/20 animate-ping" style={{animationDuration:"2s"}} />
            <div className="absolute w-16 h-16 rounded-full border-2 border-[#6366f1]/30 animate-ping" style={{animationDuration:"1.5s"}} />
            <div className="w-12 h-12 rounded-full bg-[#6366f1]/20 border border-[#6366f1]/60 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
          </div>

          {/* Current status */}
          <div className="text-center">
            <p className="text-white text-[18px] font-bold mb-1">Mapping columns…</p>
            <p className="text-[#94A3B8] text-[13px] leading-relaxed">Grok AI is analyzing your spreadsheet<br/>and mapping fields to the CRM schema</p>
          </div>

          {/* Steps list */}
          <div className="w-full flex flex-col gap-2">
            {[
              { label: "Reading spreadsheet (47 rows)", done: true },
              { label: "Sending to Grok AI", done: true },
              { label: "Mapping column headers", done: true },
              { label: "Detecting organization types", active: true },
              { label: "Validating addresses & phones", pending: true },
              { label: "Generating row report", pending: true },
            ].map((step, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${step.active ? "bg-[#6366f1]/10 border border-[#6366f1]/30" : "bg-[#111827]"}`}>
                {step.done ? (
                  <div className="w-4 h-4 rounded-full bg-[#10B981] flex items-center justify-center flex-shrink-0">
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
                ) : step.active ? (
                  <div className="w-4 h-4 rounded-full border-2 border-[#6366f1] border-t-transparent flex-shrink-0" style={{animation:"spin 0.8s linear infinite"}} />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-[#253048] flex-shrink-0" />
                )}
                <span className={`text-[13px] ${step.done ? "text-[#10B981]" : step.active ? "text-white font-semibold" : "text-[#64748B]"}`}>{step.label}</span>
                {step.active && (
                  <div className="ml-auto flex gap-0.5">
                    {[0,1,2].map(d => (
                      <div key={d} className="w-1 h-1 rounded-full bg-[#6366f1]" style={{animation:`bounce 1s ${d*0.2}s infinite`}} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[#64748B] text-center">This usually takes 5–15 seconds</p>
        </div>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes ping { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }
      `}</style>
    </div>
  );
}
