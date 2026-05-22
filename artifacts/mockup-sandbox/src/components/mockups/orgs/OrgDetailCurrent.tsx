import { useState } from "react";

const org = {
  name: "Lockheed Martin Corp",
  legalName: "Lockheed Martin Corporation",
  type: "Prime Contractor",
  typeColor: "#6366f1",
  structure: "Enterprise",
  structColor: "#6366f1",
  vertical: "GovCon",
  vertColor: "#10b981",
  state: "ACTIVE",
  stateColor: "#10b981",
  stateLabel: "Active",
  parentOrg: null,
  ultimateParent: null,
  website: "lockheedmartin.com",
  phone: "+1 (301) 897-6000",
  city: "Bethesda", stateAbbr: "MD",
  industry: "Defense & Aerospace",
  contacts: [
    { id:"c1", name:"Marcus Webb", title:"VP, Business Dev", strength:"WARM", color:"#f59e0b" },
    { id:"c2", name:"Sandra Cho", title:"Chief Contracts Officer", strength:"HOT", color:"#10b981" },
    { id:"c3", name:"David Reyes", title:"Contracting Officer", strength:"COLD", color:"#64748b" },
  ],
  children: [
    { name:"LM Aeronautics Co.", structure:"Regional" },
    { name:"LM Missiles & Fire Control", structure:"Regional" },
    { name:"LM Space", structure:"Subsidiary" },
  ],
  opps: [
    { title:"F-35 Sustainment Contract", stage:"Proposal", value:"$2.1M", color:"#3b82f6" },
    { title:"CJADC2 Integration", stage:"Qualification", value:"$340K", color:"#f59e0b" },
  ],
};

function Section({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 px-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#94a3b8] text-[11px] font-semibold uppercase tracking-wider">{title}</span>
        {action && <span className="text-[#10b981] text-[11px] font-semibold">{action}</span>}
      </div>
      {children}
    </div>
  );
}

function CollapseSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 mb-3">
      <button
        className="w-full flex items-center justify-between py-2 border-t border-[#1e3a5f]"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-[#94a3b8] text-[13px] font-semibold">{title}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div className="pt-2">{children}</div>}
    </div>
  );
}

export function OrgDetailCurrent() {
  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-3 border-b border-[#1e3a5f] flex-shrink-0">
        <button className="w-8 h-8 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="text-white font-semibold text-[16px] flex-1 truncate">{org.name}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {/* Hero */}
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: org.typeColor + "22" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={org.typeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><path d="M8 7V5a2 2 0 0 0-4 0v2"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-[17px] leading-tight">{org.name}</p>
            <p className="text-[#475569] text-[11px] italic mt-0.5">{org.legalName}</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border"
            style={{ backgroundColor: org.stateColor+"18", borderColor: org.stateColor+"55" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: org.stateColor }} />
            <span className="text-[11px] font-semibold" style={{ color: org.stateColor }}>{org.stateLabel}</span>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 px-4 mb-3">
          {[{l:org.type,c:org.typeColor},{l:org.structure,c:org.structColor},{l:org.vertical,c:org.vertColor}].map(b => (
            <span key={b.l} className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: b.c+"22", color: b.c }}>{b.l}</span>
          ))}
        </div>

        {/* Tool row */}
        <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-none">
          {[
            { icon:"✏️", label:"Edit", color:"#10b981" },
            { icon:"🔗", label:"Set Parent", color:"#3b82f6" },
            { icon:"🖼️", label:"Enrich", color:"#64748b" },
            { icon:"↗️", label:"Share", color:"#64748b" },
          ].map(t => (
            <button key={t.label} className="flex items-center gap-1.5 flex-shrink-0 border rounded-xl px-3 py-2 text-[12px] font-semibold"
              style={{ borderColor: t.color+"44", color: t.color, backgroundColor: t.color+"0f" }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Primary Action */}
        <Section title="Primary Action">
          <div className="bg-[#10b98112] border border-[#10b98133] rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#10b98133] flex items-center justify-center text-[20px] flex-shrink-0">🎯</div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-[13px]">Capture Missing Contact</p>
              <p className="text-[#64748b] text-[11px] mt-0.5">No procurement officer on file — scan a card or add manually</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </Section>

        {/* Intelligence */}
        <Section title="Account Intelligence">
          <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl p-3 flex gap-3">
            {[{l:"Health",v:"72%",c:"#10b981"},{l:"Risk",v:"Low",c:"#3b82f6"},{l:"Gaps",v:"2",c:"#f59e0b"}].map(m => (
              <div key={m.l} className="flex-1 text-center">
                <p className="font-bold text-[16px]" style={{ color: m.c }}>{m.v}</p>
                <p className="text-[#475569] text-[10px]">{m.l}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Pipeline */}
        <Section title={`Pipeline (${org.opps.length})`} action="+ New Opp">
          <div className="flex flex-col gap-2">
            {org.opps.map(o => (
              <div key={o.title} className="flex items-center gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3 py-2.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[12px] font-semibold truncate">{o.title}</p>
                  <p className="text-[#64748b] text-[11px]">{o.stage}</p>
                </div>
                <span className="text-[#f59e0b] text-[12px] font-bold">{o.value}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Contacts */}
        <Section title={`Contacts (${org.contacts.length})`} action="+ Add">
          <div className="flex flex-col gap-2">
            {org.contacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3 py-2.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                  style={{ backgroundColor: c.color+"28", color: c.color }}>
                  {c.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[13px] font-semibold">{c.name}</p>
                  <p className="text-[#64748b] text-[11px] truncate">{c.title}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: c.color+"22", color: c.color }}>{c.strength}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Timeline */}
        <Section title="Timeline">
          <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl p-3">
            <div className="flex gap-2 mb-3">
              {["Activities","Tasks"].map((t,i) => (
                <button key={t} className="px-3 py-1 rounded-full text-[11px] font-semibold border"
                  style={{ backgroundColor: i===0?"#10b98118":"transparent", borderColor: i===0?"#10b981":"#1e3a5f", color: i===0?"#10b981":"#64748b" }}>
                  {t}
                </button>
              ))}
            </div>
            {[
              { icon:"📞", text:"Call with Marcus Webb", sub:"2 days ago", c:"#10b981" },
              { icon:"📧", text:"Email follow-up sent", sub:"5 days ago", c:"#3b82f6" },
              { icon:"📋", text:"Proposal submitted", sub:"2 weeks ago", c:"#f59e0b" },
            ].map((a,i) => (
              <div key={i} className="flex gap-2.5 py-2 border-t border-[#1e3a5f] first:border-t-0">
                <span className="text-[14px]">{a.icon}</span>
                <div>
                  <p className="text-white text-[12px]">{a.text}</p>
                  <p className="text-[#475569] text-[10px]">{a.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Additional Info (collapsed) */}
        <CollapseSection title="Additional Info">
          <div className="flex flex-col gap-2">
            <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl p-3">
              <p className="text-[#64748b] text-[10px] font-semibold uppercase mb-2">Hierarchy</p>
              <p className="text-[#475569] text-[11px] mb-1">Parent: <span className="text-[#64748b]">None set</span></p>
              <p className="text-[#475569] text-[11px]">Children ({org.children.length}):</p>
              {org.children.map(c => (
                <p key={c.name} className="text-[#64748b] text-[11px] ml-3 mt-1">↳ {c.name} <span className="text-[#334155]">· {c.structure}</span></p>
              ))}
            </div>
            <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl p-3">
              <p className="text-[#64748b] text-[10px] font-semibold uppercase mb-2">Contact Details</p>
              {[{ i:"🌐", l:org.website },{ i:"📞", l:org.phone },{ i:"📍", l:`${org.city}, ${org.stateAbbr}` }].map(f => (
                <p key={f.l} className="text-[#64748b] text-[11px] mt-1">{f.i} {f.l}</p>
              ))}
            </div>
          </div>
        </CollapseSection>
      </div>

      {/* Route badge */}
      <div className="flex justify-center py-2 border-t border-[#1e3a5f]">
        <span className="text-[9px] text-[#334155] font-mono">/organization/[id]</span>
      </div>
    </div>
  );
}
