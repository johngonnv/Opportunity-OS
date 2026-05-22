import { useState } from "react";

type OrgNode = {
  id: string;
  name: string;
  tier: "prime" | "sub" | "subsidiary";
  naics: string;
  awards: number;
  contacts: number;
  children?: OrgNode[];
  expanded?: boolean;
};

const tree: OrgNode = {
  id: "1",
  name: "Lockheed Martin Corp",
  tier: "prime",
  naics: "336414",
  awards: 142,
  contacts: 18,
  expanded: true,
  children: [
    {
      id: "2",
      name: "LM Aeronautics",
      tier: "subsidiary",
      naics: "336411",
      awards: 67,
      contacts: 9,
      expanded: true,
      children: [
        { id: "4", name: "Sikorsky Aircraft", tier: "sub", naics: "336412", awards: 23, contacts: 4 },
        { id: "5", name: "LM Skunk Works", tier: "sub", naics: "541330", awards: 11, contacts: 2 },
      ],
    },
    {
      id: "3",
      name: "LM Missiles & Fire Control",
      tier: "subsidiary",
      naics: "336419",
      awards: 38,
      contacts: 6,
      children: [
        { id: "6", name: "Leidos (subcontract)", tier: "sub", naics: "541519", awards: 8, contacts: 3 },
      ],
    },
  ],
};

const tierColors: Record<string, { bg: string; border: string; text: string; label: string }> = {
  prime:      { bg: "#6366f118", border: "#6366f155", text: "#818cf8", label: "Prime" },
  subsidiary: { bg: "#10b98112", border: "#10b98144", text: "#10b981", label: "Sub-Org" },
  sub:        { bg: "#f59e0b10", border: "#f59e0b40", text: "#f59e0b", label: "Sub" },
};

function OrgCard({ node, depth }: { node: OrgNode; depth: number }) {
  const [open, setOpen] = useState(node.expanded ?? false);
  const t = tierColors[node.tier];
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div style={{ marginLeft: depth > 0 ? 18 : 0 }}>
      {depth > 0 && (
        <div className="flex items-start gap-0">
          <div style={{ width: 1, marginLeft: -10, marginRight: 9, height: "100%", borderLeft: "1.5px dashed #1e3a5f" }} />
        </div>
      )}
      <div
        className="mb-2 rounded-xl border px-3.5 py-2.5 cursor-pointer select-none"
        style={{ backgroundColor: t.bg, borderColor: t.border }}
        onClick={() => hasChildren && setOpen(o => !o)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                {open ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
              </svg>
            )}
            <span className="text-white font-semibold text-[13px] truncate">{node.name}</span>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ color: t.text, backgroundColor: t.border }}>{t.label}</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 pl-4">
          <span className="text-[10px] font-mono text-[#64748b]">NAICS {node.naics}</span>
          <span className="text-[10px] text-[#64748b]">·</span>
          <span className="text-[10px] text-[#64748b]">{node.awards} awards</span>
          <span className="text-[10px] text-[#64748b]">·</span>
          <span className="text-[10px] text-[#64748b]">{node.contacts} contacts</span>
        </div>
      </div>
      {hasChildren && open && (
        <div className="ml-3 border-l border-dashed border-[#1e3a5f] pl-3">
          {node.children!.map(child => (
            <OrgCard key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function HierarchyViewer() {
  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans">
      {/* Header */}
      <div className="px-5 pt-14 pb-3 border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2 mb-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span className="text-white font-bold text-[18px]">Org Hierarchy</span>
        </div>
        <p className="text-[#64748b] text-[11px]">Tap nodes to expand · scanned via Opportunity Eye</p>

        {/* Legend */}
        <div className="flex gap-3 mt-3">
          {Object.entries(tierColors).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: v.text }} />
              <span className="text-[10px] text-[#64748b]">{v.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scan origin badge */}
      <div className="mx-5 mt-3 flex items-center gap-2.5 bg-[#6366f112] border border-[#6366f133] rounded-xl px-3.5 py-2.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <div>
          <p className="text-[#818cf8] text-[11px] font-semibold">Captured via Opportunity Eye</p>
          <p className="text-[#64748b] text-[10px]">Logo scan · matched to SAM.gov entity</p>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        <OrgCard node={tree} depth={0} />
      </div>

      {/* Action bar */}
      <div className="px-5 pb-8 border-t border-[#1e3a5f] pt-3 flex gap-2">
        <button className="flex-1 flex items-center justify-center gap-2 bg-[#6366f1] text-white text-[13px] font-semibold py-3 rounded-xl">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Contact
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 bg-[#0d2040] border border-[#1e3a5f] text-[#94a3b8] text-[13px] font-semibold py-3 rounded-xl">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          Export
        </button>
      </div>

      {/* Route badge */}
      <div className="flex justify-center pb-3">
        <span className="text-[10px] text-[#475569] font-mono bg-[#1e293b] px-3 py-1 rounded-full">/org/[id]/hierarchy</span>
      </div>
    </div>
  );
}
