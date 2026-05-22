import { useState } from "react";

const summary = {
  org: { name: "Memorial Health System", emoji: "🏥", typeColor: "#6366f1" },
  headline: "Site Visit · May 22, 2026",
  source: "Conference / Event",
  grokSummary: "Site visit to Memorial Health System HQ. Met with CMO and Supply Chain Director. Discussed Epic integration timeline and device supply contract. Decision maker expressed interest in Q3 pilot. Competitor MedPulse was mentioned — currently in evaluation. Next steps: send integration spec and follow up re: budget approval.",
  contacts: [
    { id: "c1", name: "Dr. Angela Torres", title: "Chief Medical Officer", action: "Update relationship strength → WARM", status: "update", checked: true },
    { id: "c2", name: "Marcus Webb", title: "Dir. IT & EHR Systems", action: "New contact — add to org", status: "new", checked: true },
  ],
  pipeline: [
    { id: "p1", title: "EHR Integration — Epic", change: "Stage → Proposal (55% → 70%)", checked: true },
    { id: "p2", title: "Medical Device Supply Agreement", change: "New opportunity — $280K est.", status: "new", checked: true },
  ],
  actions: [
    { id: "a1", text: "Send Epic integration spec to IT team", due: "In 3 days", checked: true },
    { id: "a2", text: "Follow up on Q3 pilot budget approval", due: "Next week", checked: true },
    { id: "a3", text: "Research MedPulse competitive positioning", due: "In 5 days", checked: false },
  ],
  marketing: [
    { id: "m1", text: "EHR Integration brochure — left with Dr. Torres", checked: true },
    { id: "m2", text: "Device catalog PDF — promised to Marcus Webb", checked: true },
  ],
};

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function CheckRow({ text, sub, badge, checked, onToggle, badgeColor }:
  { text: string; sub?: string; badge?: string; checked: boolean; onToggle: () => void; badgeColor?: string }) {
  return (
    <div className="flex items-start gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3 py-2.5 mb-1.5 cursor-pointer"
      onClick={onToggle}
      style={{ opacity: checked ? 1 : 0.45 }}>
      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ borderColor: checked ? "#10b981" : "#334155", backgroundColor: checked ? "#10b981" : "transparent" }}>
        {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-[12px] font-semibold leading-snug">{text}</p>
        {sub && <p className="text-[#64748b] text-[10px] mt-0.5">{sub}</p>}
      </div>
      {badge && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: (badgeColor || "#10b981") + "22", color: badgeColor || "#10b981" }}>{badge}</span>
      )}
    </div>
  );
}

export function OpportunityEventReview() {
  const [contacts, setContacts] = useState(summary.contacts.map(c => ({ ...c })));
  const [pipeline, setPipeline] = useState(summary.pipeline.map(p => ({ ...p })));
  const [actions, setActions] = useState(summary.actions.map(a => ({ ...a })));
  const [marketing, setMarketing] = useState(summary.marketing.map(m => ({ ...m })));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (arr: any[], setArr: any, id: string) =>
    setArr(arr.map((x: any) => x.id === id ? { ...x, checked: !x.checked } : x));

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setSaved(true); }, 1800);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-12 pb-3 border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2 mb-2">
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1e3a5f]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-[17px]">Review & Confirm</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span className="text-[#10b981] text-[11px] font-semibold">Grok analysis complete</span>
            </div>
          </div>
          <span className="text-[#64748b] text-[10px] bg-[#0d1f3a] border border-[#1e3a5f] px-2 py-1 rounded-xl">Step 2 of 2</span>
        </div>

        {/* Org + event strip */}
        <div className="flex items-center gap-2.5 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3 py-2"
          style={{ borderLeftWidth: 3, borderLeftColor: summary.org.typeColor }}>
          <span className="text-[16px]">{summary.org.emoji}</span>
          <div className="flex-1">
            <p className="text-white font-semibold text-[12px]">{summary.org.name}</p>
            <p className="text-[#64748b] text-[10px]">{summary.headline} · {summary.source}</p>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {/* Grok summary */}
        <div className="mb-4 bg-[#10b98110] border border-[#10b98130] rounded-2xl p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span className="text-[#10b981] text-[11px] font-bold">Grok Summary</span>
          </div>
          <p className="text-[#94a3b8] text-[12px] leading-relaxed">{summary.grokSummary}</p>
        </div>

        {/* Contacts */}
        <Section title={`Contacts (${contacts.length})`} color="#6366f1">
          {contacts.map(c => (
            <CheckRow key={c.id} text={c.name} sub={`${c.title} — ${c.action}`}
              badge={c.status === "new" ? "NEW" : "UPDATE"} badgeColor={c.status === "new" ? "#10b981" : "#f59e0b"}
              checked={c.checked} onToggle={() => toggle(contacts, setContacts, c.id)} />
          ))}
        </Section>

        {/* Pipeline */}
        <Section title={`Pipeline Changes (${pipeline.length})`} color="#3b82f6">
          {pipeline.map(p => (
            <CheckRow key={p.id} text={p.title} sub={p.change}
              badge={(p as any).status === "new" ? "NEW" : "UPDATE"} badgeColor={(p as any).status === "new" ? "#10b981" : "#3b82f6"}
              checked={p.checked} onToggle={() => toggle(pipeline, setPipeline, p.id)} />
          ))}
        </Section>

        {/* Action Items */}
        <Section title={`Action Items (${actions.length})`} color="#f59e0b">
          {actions.map(a => (
            <CheckRow key={a.id} text={a.text} sub={`Due: ${a.due}`}
              checked={a.checked} onToggle={() => toggle(actions, setActions, a.id)} />
          ))}
        </Section>

        {/* Marketing */}
        <Section title={`Marketing Resources (${marketing.length})`} color="#64748b">
          {marketing.map(m => (
            <CheckRow key={m.id} text={m.text}
              checked={m.checked} onToggle={() => toggle(marketing, setMarketing, m.id)} />
          ))}
        </Section>

        {/* .ics button */}
        <button className="w-full flex items-center justify-center gap-2 border border-dashed border-[#1e3a5f] rounded-2xl py-3 mb-3 text-[#64748b] text-[12px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Create .ics Calendar Event (optional)
        </button>

        {/* Save button */}
        {saved ? (
          <div className="w-full rounded-2xl py-4 flex items-center justify-center gap-2 bg-[#10b981]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span className="text-white font-bold text-[15px]">Saved to CRM</span>
          </div>
        ) : (
          <button onClick={handleSave} disabled={saving}
            className="w-full rounded-2xl py-4 flex items-center justify-center gap-3 bg-[#6366f1] transition-all"
            style={{ opacity: saving ? 0.8 : 1 }}>
            {saving ? (
              <><div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <span className="text-white font-bold text-[15px]">Saving…</span></>
            ) : (
              <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <span className="text-white font-bold text-[15px]">Save to CRM</span></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
