import { useState } from "react";

const org = {
  name: "Memorial Health System",
  emoji: "🏥",
  typeColor: "#6366f1",
  type: "Health System",
  city: "Savannah, GA",
  npi: "1234567890",
};

const brief = {
  generatedAt: "May 22, 2026 · 12:31 PM",
  visitPurpose: "Epic EHR Integration Discussion + Device Supply Review",
  contacts: [
    { name: "Dr. Angela Torres", title: "Chief Medical Officer", dept: "Executive", strength: "WARM", strengthColor: "#f59e0b", note: "Key decision-maker. Prefers data-led conversations. Allergic to sales-y pitches." },
    { name: "Sandra Cho", title: "Chief Operating Officer", dept: "Executive", strength: "HOT", strengthColor: "#10b981", note: "Budget authority for Q3 initiatives. Last interaction: exec briefing 10 days ago." },
    { name: "Marcus Webb", title: "Dir. IT & EHR Systems", dept: "IT", strength: "COLD", strengthColor: "#64748b", note: "New contact — no prior engagement. Technical gatekeeper for EHR evaluation." },
  ],
  lastInteractions: [
    { icon: "📞", text: "Call — EHR readiness review w/ Dr. Torres", when: "3 days ago" },
    { icon: "🤝", text: "Onsite exec briefing w/ Sandra Cho", when: "10 days ago" },
    { icon: "📧", text: "Proposal sent to supply chain team", when: "2 weeks ago" },
  ],
  pipeline: [
    { title: "EHR Integration — Epic", stage: "Qualification", value: "$1.1M", pct: 40, color: "#3b82f6" },
    { title: "Medical Device Supply Agreement", stage: "Discovery", value: "$280K", pct: 20, color: "#f59e0b" },
  ],
  painPoints: [
    "No unified EHR across all facilities — interoperability is #1 priority for FY26",
    "Supply chain team under pressure to reduce device vendor count",
    "IT team stretched thin — implementation complexity is a blocker",
  ],
  talkingPoints: [
    "Lead with Epic integration ROI data from similar health systems",
    "Address IT complexity head-on — show dedicated implementation support",
    "Reference Q3 pilot timeline alignment with their budget cycle",
    "Mention MedPulse's delayed rollout at St. Joseph's (known competitor gap)",
  ],
  competitive: "MedPulse is in active evaluation. Their quote was 12% cheaper but implementation timeline is 6 months longer.",
};

export function PreVisitBrief() {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    contacts: true, interactions: true, pipeline: true, pain: false, talking: false, competitive: false
  });

  const toggle = (k: string) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 2000);
  };

  if (!generated) {
    return (
      <div className="flex flex-col h-screen bg-[#0a1628] font-sans">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-12 pb-2 border-b border-[#1e3a5f] flex-shrink-0">
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1e3a5f]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-white font-semibold text-[15px] flex-1">{org.name}</span>
        </div>

        {/* Org identity card — same style as redesigned org detail */}
        <div className="mx-4 mt-4 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl p-4"
          style={{ borderLeftWidth: 4, borderLeftColor: org.typeColor }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#1e3a5f] flex items-center justify-center text-[22px]">{org.emoji}</div>
            <div>
              <p className="text-white font-bold text-[15px]">{org.name}</p>
              <p className="text-[#64748b] text-[10px] font-mono">NPI {org.npi} · {org.city}</p>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#6366f122] text-[#818cf8] mt-1 inline-block">{org.type}</span>
            </div>
          </div>
        </div>

        {/* Generate button */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-20 h-20 rounded-full bg-[#6366f115] border border-[#6366f133] flex items-center justify-center mb-5">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h2 className="text-white font-bold text-[18px] mb-2 text-center">Generate Pre-Visit Brief</h2>
          <p className="text-[#64748b] text-[13px] text-center leading-relaxed mb-8">
            Grok will summarize key contacts, last interactions, pipeline status, pain points, and personalized talking points for your visit.
          </p>

          <button onClick={handleGenerate}
            className="w-full rounded-2xl py-4 flex items-center justify-center gap-3"
            style={{ backgroundColor: generating ? "#1e3a5f" : "#6366f1" }}>
            {generating ? (
              <><div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <span className="text-white font-bold text-[15px]">Generating Brief…</span></>
            ) : (
              <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span className="text-white font-bold text-[15px]">Generate Pre-Visit Brief</span></>
            )}
          </button>

          <p className="text-[#334155] text-[10px] mt-3 text-center">
            Powered by Grok · Uses your CRM data
          </p>
        </div>
      </div>
    );
  }

  // Brief result
  function AccordionSection({ id, title, color, count, children }: { id: string; title: string; color: string; count?: number; children: React.ReactNode }) {
    const isOpen = expanded[id];
    return (
      <div className="mb-2 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl overflow-hidden">
        <button className="w-full flex items-center justify-between px-4 py-3" onClick={() => toggle(id)}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-white font-semibold text-[13px]">{title}</span>
            {count !== undefined && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: color + "22", color }}>{count}</span>
            )}
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {isOpen && <div className="px-4 pb-3 border-t border-[#1e3a5f]">{children}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-12 pb-3 border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2 mb-2">
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1e3a5f]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-[16px]">Pre-Visit Brief</h1>
            <p className="text-[#64748b] text-[10px]">{org.name} · {brief.generatedAt}</p>
          </div>
          <button className="text-[#64748b] text-[10px] border border-[#1e3a5f] px-2.5 py-1.5 rounded-xl">Share</button>
        </div>

        <div className="bg-[#6366f112] border border-[#6366f130] rounded-xl px-3 py-2">
          <p className="text-[#818cf8] text-[11px] font-semibold">Visit Purpose: {brief.visitPurpose}</p>
        </div>
      </div>

      {/* Scrollable brief */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
        <AccordionSection id="contacts" title="Key Contacts" color="#6366f1" count={brief.contacts.length}>
          <div className="pt-2 flex flex-col gap-2">
            {brief.contacts.map(c => (
              <div key={c.name} className="flex gap-2.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ backgroundColor: c.strengthColor + "28", color: c.strengthColor }}>
                  {c.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-semibold text-[12px]">{c.name}</span>
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-full"
                      style={{ backgroundColor: c.strengthColor + "22", color: c.strengthColor }}>{c.strength}</span>
                  </div>
                  <p className="text-[#64748b] text-[10px]">{c.title}</p>
                  <p className="text-[#475569] text-[10px] mt-0.5 leading-snug">{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection id="interactions" title="Last Interactions" color="#3b82f6" count={brief.lastInteractions.length}>
          <div className="pt-2 flex flex-col gap-1.5">
            {brief.lastInteractions.map((i, idx) => (
              <div key={idx} className="flex gap-2.5 items-start">
                <span className="text-[14px] flex-shrink-0">{i.icon}</span>
                <div><p className="text-white text-[11px]">{i.text}</p>
                <p className="text-[#334155] text-[10px]">{i.when}</p></div>
              </div>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection id="pipeline" title="Pipeline Status" color="#f59e0b" count={brief.pipeline.length}>
          <div className="pt-2 flex flex-col gap-2">
            {brief.pipeline.map(p => (
              <div key={p.title} className="flex items-center gap-2">
                <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[11px] font-semibold truncate">{p.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[#64748b] text-[10px]">{p.stage}</span>
                    <div className="flex-1 h-1 bg-[#1e3a5f] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p.pct}%`, backgroundColor: p.color }} />
                    </div>
                    <span className="text-[#64748b] text-[10px]">{p.pct}%</span>
                  </div>
                </div>
                <span className="text-[#f59e0b] text-[12px] font-bold flex-shrink-0">{p.value}</span>
              </div>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection id="pain" title="Pain Points" color="#ef4444" count={brief.painPoints.length}>
          <ul className="pt-2 flex flex-col gap-1.5">
            {brief.painPoints.map((p, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="text-[#ef4444] text-[12px] flex-shrink-0 mt-0.5">⚠</span>
                <p className="text-[#94a3b8] text-[11px] leading-snug">{p}</p>
              </li>
            ))}
          </ul>
        </AccordionSection>

        <AccordionSection id="talking" title="Talking Points" color="#10b981" count={brief.talkingPoints.length}>
          <ul className="pt-2 flex flex-col gap-1.5">
            {brief.talkingPoints.map((p, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="text-[#10b981] text-[12px] flex-shrink-0 mt-0.5">→</span>
                <p className="text-[#94a3b8] text-[11px] leading-snug">{p}</p>
              </li>
            ))}
          </ul>
        </AccordionSection>

        <AccordionSection id="competitive" title="Competitive Intel" color="#8b5cf6">
          <p className="text-[#94a3b8] text-[11px] leading-relaxed pt-2">{brief.competitive}</p>
        </AccordionSection>

        {/* Grok badge */}
        <div className="flex items-center justify-center gap-2 mt-3">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span className="text-[#334155] text-[10px]">Generated by Grok · {brief.generatedAt}</span>
        </div>
      </div>
    </div>
  );
}
