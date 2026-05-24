const activityTypes = [
  { id: "call", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.01 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>, label: "Phone Call", color: "#10B981" },
  { id: "email", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, label: "Email", color: "#0EA5E9" },
  { id: "visit", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>, label: "In-Person", color: "#F59E0B" },
  { id: "demo", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, label: "Demo", color: "#8B5CF6" },
];

const times = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "2:00 PM", "3:00 PM"];
const dates = [
  { day: "Mon", date: "26" },
  { day: "Tue", date: "27" },
  { day: "Wed", date: "28" },
  { day: "Thu", date: "29" },
  { day: "Fri", date: "30" },
];

export function PostImportScheduleTouch() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18]">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center px-4 pt-14 pb-4 border-b border-[#253048]">
          <button className="p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="flex-1 text-center text-white text-[16px] font-bold">Schedule First Touch</div>
          <div className="w-7" />
        </div>

        <div className="flex-1 overflow-auto px-4 py-4 flex flex-col gap-4" style={{paddingBottom:"110px"}}>
          {/* Org context pill */}
          <div className="flex items-center gap-2.5 bg-[#111827] border border-[#253048] rounded-xl px-3 py-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#10B981]/20 flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white">Mercy General Hospital</p>
              <p className="text-[10px] text-[#64748B]">4001 J St · Sacramento, CA</p>
            </div>
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30">NEW</span>
          </div>

          {/* Activity type */}
          <div>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Activity Type</p>
            <div className="grid grid-cols-4 gap-2">
              {activityTypes.map((a, i) => (
                <button key={i} className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 ${i === 0 ? "border-[#10B981]/50 bg-[#10B981]/10" : "border-[#253048] bg-[#111827]"}`}>
                  <span style={{color: i === 0 ? a.color : "#64748B"}}>{a.icon}</span>
                  <span className="text-[9px] font-semibold" style={{color: i === 0 ? a.color : "#64748B"}}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Contact to reach */}
          <div>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Contact</p>
            <div className="bg-[#111827] border border-[#10B981]/40 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[14px] flex-shrink-0">👩‍⚕️</div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white">Dr. Sarah M. Chen, DNP</p>
                <p className="text-[10px] text-[#64748B]">CNO · (916) 453-2200</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
            </div>
          </div>

          {/* Date picker */}
          <div>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Date — May 2026</p>
            <div className="flex gap-2">
              {dates.map((d, i) => (
                <button key={i} className={`flex-1 flex flex-col items-center gap-1 rounded-xl py-2.5 border ${i === 1 ? "border-[#6366f1]/50 bg-[#6366f1]/15" : "border-[#253048] bg-[#111827]"}`}>
                  <span className="text-[9px] font-semibold" style={{color: i === 1 ? "#a5b4fc" : "#64748B"}}>{d.day}</span>
                  <span className="text-[16px] font-black" style={{color: i === 1 ? "white" : "#94A3B8"}}>{d.date}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Time picker */}
          <div>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Time</p>
            <div className="flex flex-wrap gap-2">
              {times.map((t, i) => (
                <button key={i} className={`px-3 py-2 rounded-xl border text-[11px] font-semibold ${i === 2 ? "border-[#6366f1]/50 bg-[#6366f1]/15 text-white" : "border-[#253048] bg-[#111827] text-[#64748B]"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Assign rep */}
          <div>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Assigned To</p>
            <div className="bg-[#111827] border border-[#253048] rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#10B981]/20 flex items-center justify-center flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <span className="text-[12px] font-semibold text-white flex-1">You (Alex Rivera)</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Notes</p>
            <div className="bg-[#111827] border border-[#253048] rounded-xl px-3 py-2.5 min-h-[64px] flex items-start">
              <p className="text-[12px] text-[#64748B] leading-relaxed">Intro call — mention new sterilization tray system. Ask about Q3 supply chain review schedule.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#070D18] border-t border-[#253048] px-4 pt-3 pb-8 flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1 mb-1">
            <div className="w-4 h-4 rounded border border-[#10B981]/40 bg-[#10B981]/10 flex items-center justify-center">
              <svg width="7" height="7" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <span className="text-[11px] text-[#64748B]">Add to calendar &amp; send reminder 1 hr before</span>
          </div>
          <button className="w-full bg-[#6366f1] rounded-xl py-4 flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01"/></svg>
            <span className="text-white text-[15px] font-bold">Schedule for Tue May 27 · 10:00 AM</span>
          </button>
        </div>
      </div>
    </div>
  );
}
