import { useState } from "react";

type OrgNode = {
  id: string; name: string; tier: "prime" | "sub" | "subsidiary";
  naics: string; awards: number; contacts: number; children?: OrgNode[]; expanded?: boolean;
};

const tree: OrgNode = {
  id: "1", name: "Memorial Health System", tier: "prime", naics: "622110", awards: 58, contacts: 22, expanded: true,
  children: [
    {
      id: "2", name: "Memorial University Med Ctr", tier: "subsidiary", naics: "622110", awards: 31, contacts: 14, expanded: true,
      children: [
        { id: "4", name: "Memorial Heart & Vascular", tier: "sub", naics: "621111", awards: 9, contacts: 5 },
        { id: "5", name: "Memorial Cancer Institute", tier: "sub", naics: "621111", awards: 6, contacts: 3 },
      ],
    },
    {
      id: "3", name: "Memorial Pediatric Hospital", tier: "subsidiary", naics: "622110", awards: 14, contacts: 7,
      children: [
        { id: "6", name: "Coastal Pediatric Specialists", tier: "sub", naics: "621112", awards: 4, contacts: 2 },
      ],
    },
  ],
};

const tierColors: Record<string, { bg: string; border: string; text: string; label: string }> = {
  prime:      { bg: "#6366f118", border: "#6366f155", text: "#818cf8", label: "Health System" },
  subsidiary: { bg: "#10b98112", border: "#10b98144", text: "#10b981", label: "Hospital" },
  sub:        { bg: "#f59e0b10", border: "#f59e0b40", text: "#f59e0b", label: "Facility" },
};

function OrgCard({ node, depth }: { node: OrgNode; depth: number }) {
  const [open, setOpen] = useState(node.expanded ?? false);
  const t = tierColors[node.tier];
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div style={{ marginLeft: depth > 0 ? 18 : 0 }}>
      <div className="mb-2 rounded-xl border px-3.5 py-2.5 cursor-pointer select-none"
        style={{ backgroundColor: t.bg, borderColor: t.border }}
        onClick={() => hasChildren && setOpen(o => !o)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"
                style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            )}
            <span className="text-white font-semibold text-[13px] truncate">{node.name}</span>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ color: t.text, backgroundColor: t.border }}>{t.label}</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 pl-4">
          <span className="text-[10px] font-mono text-[#64748b]">NPI {node.naics}</span>
          <span className="text-[10px] text-[#64748b]">·</span>
          <span className="text-[10px] text-[#64748b]">{node.awards} contracts</span>
          <span className="text-[10px] text-[#64748b]">·</span>
          <span className="text-[10px] text-[#64748b]">{node.contacts} contacts</span>
        </div>
      </div>
      {hasChildren && open && (
        <div className="ml-3 border-l border-dashed border-[#1e3a5f] pl-3">
          {node.children!.map(child => <OrgCard key={child.id} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export function HierarchyViewer() {
  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans">
      <div className="px-5 pt-14 pb-3 border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2 mb-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span className="text-white font-bold text-[18px]">Care Network</span>
        </div>
        <p className="text-[#64748b] text-[11px]">Tap nodes to expand · scanned via Opportunity Eye</p>
        <div className="flex gap-3 mt-3">
          {Object.entries(tierColors).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: v.text }} />
              <span className="text-[10px] text-[#64748b]">{v.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-5 mt-3 flex items-center gap-2.5 bg-[#6366f112] border border-[#6366f133] rounded-xl px-3.5 py-2.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <div>
          <p className="text-[#818cf8] text-[11px] font-semibold">Captured via Opportunity Eye</p>
          <p className="text-[#64748b] text-[10px]">Logo scan · matched to NPI registry</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        <OrgCard node={tree} depth={0} />
      </div>

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

      <div className="flex justify-center pb-3">
        <span className="text-[10px] text-[#475569] font-mono bg-[#1e293b] px-3 py-1 rounded-full">/org/[id]/hierarchy</span>
      </div>
    </div>
  );
}
