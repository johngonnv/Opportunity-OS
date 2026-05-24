const contacts = [
  { name: "Dr. Sarah M. Chen, DNP", role: "Chief Nursing Officer", phone: "(916) 453-2200", icon: "👩‍⚕️", color: "#8B5CF6", verified: true },
  { name: "Marcus Delgado", role: "VP Supply Chain", phone: "(916) 453-2345 x4812", icon: "📦", color: "#0EA5E9", verified: true },
  { name: "Director of Surgical Services", role: "Surgery · Name not found", phone: "(916) 453-2200", icon: "🔬", color: "#64748B", verified: false },
];

const tags = ["Level I Trauma", "Teaching", "340B", "Trinity Health"];

export function PostImportOrgRecord() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18]">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center px-4 pt-14 pb-3 border-b border-[#253048]">
          <button className="p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="flex-1 text-center text-white text-[16px] font-bold">Organization</div>
          <button className="p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto" style={{paddingBottom:"90px"}}>
          {/* Org header */}
          <div className="px-4 pt-4 pb-3 bg-[#111827] border-b border-[#253048]">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center flex-shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[16px] font-black text-white">Mercy General Hospital</h1>
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30">NEW</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <p className="text-[11px] text-[#64748B]">4001 J St, Sacramento, CA 95819</p>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="text-[10px] bg-[#253048] text-[#94A3B8] px-2 py-0.5 rounded-full font-semibold">Hospital</span>
                  {tags.map((t, i) => (
                    <span key={i} className="text-[10px] bg-[#253048]/70 text-[#64748B] px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex gap-3 mt-3 pt-3 border-t border-[#253048]">
              {[
                { label: "NPI", value: "1902840155" },
                { label: "Beds", value: "336" },
                { label: "Rating", value: "4.2 ★" },
              ].map((s, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-[10px] text-[#64748B]">{s.label}</span>
                  <span className="text-[12px] font-bold text-white">{s.value}</span>
                </div>
              ))}
              <div className="ml-auto flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1]" />
                <span className="text-[10px] text-[#6366f1] font-semibold">Grok verified</span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 px-4 py-3 border-b border-[#253048]">
            {[
              { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.01 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>, label: "Call", color: "#10B981" },
              { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>, label: "Add Task", color: "#6366f1" },
              { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>, label: "Log Visit", color: "#F59E0B" },
              { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, label: "Email", color: "#0EA5E9" },
            ].map((a, i) => (
              <button key={i} className="flex-1 flex flex-col items-center gap-1.5 bg-[#111827] border border-[#253048] rounded-xl py-2.5">
                {a.icon}
                <span className="text-[10px] font-semibold" style={{color: a.color}}>{a.label}</span>
              </button>
            ))}
          </div>

          {/* Phone */}
          <div className="px-4 py-3 border-b border-[#253048]">
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Contact Info</p>
            <div className="flex flex-col gap-2">
              {[
                { label: "Main", value: "(916) 453-4545", verified: true },
                { label: "Billing", value: "(916) 453-4547", verified: true },
                { label: "Fax", value: "(916) 453-4601", verified: true },
              ].map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-[#64748B] w-10 flex-shrink-0">{p.label}</span>
                  <span className="text-[12px] text-white font-medium flex-1">{p.value}</span>
                  {p.verified && <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />}
                </div>
              ))}
            </div>
          </div>

          {/* Contacts */}
          <div className="px-4 py-3 border-b border-[#253048]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Key Contacts</p>
              <span className="text-[9px] bg-[#6366f1]/20 text-[#6366f1] px-1.5 py-0.5 rounded font-bold">Grok sourced</span>
            </div>
            <div className="flex flex-col gap-2">
              {contacts.map((c, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-[#111827] rounded-xl border border-[#253048] px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[14px]" style={{backgroundColor: c.color+"22", border:`1px solid ${c.color}44`}}>
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-white truncate">{c.name}</p>
                    <p className="text-[10px] text-[#64748B]">{c.role}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {c.verified && <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />}
                    <button className="p-1">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.01 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity feed placeholder */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Activity</p>
            <div className="flex items-center gap-2.5 bg-[#111827] border border-[#253048] rounded-xl px-3 py-3">
              <div className="w-6 h-6 rounded-full bg-[#10B981]/20 flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-white">Imported via Grok bulk upload</p>
                <p className="text-[10px] text-[#64748B]">Today · 45 orgs batch · Grok enriched</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#070D18] border-t border-[#253048] px-4 pt-3 pb-8">
          <button className="w-full bg-[#6366f1] rounded-xl py-4 flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span className="text-white text-[15px] font-bold">Schedule First Touch</span>
          </button>
        </div>
      </div>
    </div>
  );
}
