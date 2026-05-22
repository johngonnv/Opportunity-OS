import { useState, useRef } from "react";

type Contact = {
  id: string;
  name: string;
  title: string;
  dept: string;
  phone: string;
  email: string;
  viaEye?: boolean;
  reports?: Contact[];
};

type Department = {
  id: string;
  name: string;
  icon: string;
  color: string;
  contacts: Contact[];
};

const departments: Department[] = [
  {
    id: "exec",
    name: "Decision Makers",
    icon: "⭐",
    color: "#6366f1",
    contacts: [
      {
        id: "c1",
        name: "Marcus Webb",
        title: "VP, Business Development",
        dept: "Executive",
        phone: "+1 (703) 555-0142",
        email: "m.webb@lockheedmartin.com",
        viaEye: true,
        reports: [
          {
            id: "c1a",
            name: "Priya Nair",
            title: "Director, GovCon Strategy",
            dept: "BD",
            phone: "+1 (703) 555-0187",
            email: "p.nair@lockheedmartin.com",
            viaEye: true,
          },
          {
            id: "c1b",
            name: "James Okafor",
            title: "Senior BD Manager",
            dept: "BD",
            phone: "+1 (703) 555-0201",
            email: "j.okafor@lockheedmartin.com",
          },
        ],
      },
      {
        id: "c2",
        name: "Sandra Cho",
        title: "Chief Contracts Officer",
        dept: "Executive",
        phone: "+1 (703) 555-0099",
        email: "s.cho@lockheedmartin.com",
      },
    ],
  },
  {
    id: "contracts",
    name: "Contracts & Procurement",
    icon: "📋",
    color: "#10b981",
    contacts: [
      {
        id: "c3",
        name: "David Reyes",
        title: "Contracting Officer",
        dept: "Procurement",
        phone: "+1 (703) 555-0318",
        email: "d.reyes@lockheedmartin.com",
        viaEye: true,
        reports: [
          {
            id: "c3a",
            name: "Aisha Thompson",
            title: "Contract Specialist",
            dept: "Procurement",
            phone: "+1 (703) 555-0349",
            email: "a.thompson@lockheedmartin.com",
            viaEye: true,
          },
        ],
      },
      {
        id: "c4",
        name: "Tom Fitzgerald",
        title: "Subcontracts Manager",
        dept: "Procurement",
        phone: "+1 (703) 555-0422",
        email: "t.fitz@lockheedmartin.com",
      },
    ],
  },
  {
    id: "tech",
    name: "Technical / Engineering",
    icon: "⚙️",
    color: "#f59e0b",
    contacts: [
      {
        id: "c5",
        name: "Rachel Kim",
        title: "Chief Systems Engineer",
        dept: "Engineering",
        phone: "+1 (703) 555-0511",
        email: "r.kim@lockheedmartin.com",
        reports: [
          {
            id: "c5a",
            name: "Omar Hassan",
            title: "Software Lead",
            dept: "Engineering",
            phone: "+1 (703) 555-0578",
            email: "o.hassan@lockheedmartin.com",
            viaEye: true,
          },
        ],
      },
    ],
  },
];

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

type QuickAction = { label: string; icon: string; color?: string };
const quickActions: QuickAction[] = [
  { label: "View Profile", icon: "👤" },
  { label: "Edit Contact", icon: "✏️" },
  { label: "Scan New Card", icon: "📷", color: "#6366f1" },
];

function ContactRow({
  contact,
  depth,
  deptColor,
}: {
  contact: Contact;
  depth: number;
  deptColor: string;
}) {
  const [expanded, setExpanded] = useState(depth === 0 && contact.reports && contact.reports.length > 0);
  const [showActions, setShowActions] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasReports = contact.reports && contact.reports.length > 0;

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => setShowActions(true), 400);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  return (
    <div style={{ marginLeft: depth * 20 }}>
      {/* Depth connector */}
      {depth > 0 && (
        <div className="flex items-center gap-0" style={{ marginLeft: -8, marginBottom: -4 }}>
          <div style={{ width: 12, height: 12, borderLeft: `1.5px dashed ${deptColor}55`, borderBottom: `1.5px dashed ${deptColor}55`, borderBottomLeftRadius: 4 }} />
        </div>
      )}

      <div
        className="mb-1.5 rounded-2xl border overflow-hidden select-none"
        style={{ borderColor: showActions ? deptColor + "88" : "#1e3a5f", backgroundColor: showActions ? deptColor + "10" : "#0d2040" }}
        onMouseDown={startLongPress}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
      >
        <div
          className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer"
          onClick={() => {
            if (showActions) { setShowActions(false); return; }
            if (hasReports) setExpanded((e) => !e);
          }}
        >
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
            style={{ backgroundColor: deptColor + "28", color: deptColor }}
          >
            {contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-white font-semibold text-[13px] leading-tight">{contact.name}</span>
              {contact.viaEye && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f130] text-[#818cf8] flex items-center gap-1 flex-shrink-0">
                  👁 Eye
                </span>
              )}
            </div>
            <p className="text-[#94a3b8] text-[11px] leading-tight mt-0.5 truncate">{contact.title}</p>
            <p className="text-[#475569] text-[10px] mt-0.5 font-mono">{truncate(contact.email, 28)}</p>
          </div>

          {/* Expand chevron */}
          {hasReports && (
            <div className="flex-shrink-0">
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke={deptColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          )}
        </div>

        {/* Quick actions (long-press) */}
        {showActions && (
          <div className="border-t px-3 py-2 flex gap-2" style={{ borderColor: deptColor + "44" }}>
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={() => setShowActions(false)}
                className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold"
                style={{ backgroundColor: a.color ? a.color + "22" : "#1e3a5f", color: a.color ?? "#94a3b8" }}
              >
                <span className="text-[16px]">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reports-to children */}
      {hasReports && expanded && (
        <div className="ml-4 border-l pl-2" style={{ borderColor: deptColor + "33", borderStyle: "dashed" }}>
          {contact.reports!.map((r) => (
            <ContactRow key={r.id} contact={r} depth={depth + 1} deptColor={deptColor} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeptSection({ dept }: { dept: Department }) {
  const [open, setOpen] = useState(true);
  const totalContacts = dept.contacts.length + dept.contacts.reduce((a, c) => a + (c.reports?.length ?? 0), 0);

  return (
    <div className="mb-4">
      <button
        className="w-full flex items-center gap-2.5 px-1 py-1.5 mb-2"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[15px]">{dept.icon}</span>
        <span className="font-bold text-[13px] flex-1 text-left" style={{ color: dept.color }}>
          {dept.name}
        </span>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: dept.color + "22", color: dept.color }}>
          {totalContacts}
        </span>
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={dept.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && dept.contacts.map((c) => (
        <ContactRow key={c.id} contact={c} depth={0} deptColor={dept.color} />
      ))}
    </div>
  );
}

export function HierarchyViewerV2() {
  const [fabOpen, setFabOpen] = useState(false);

  const metrics = [
    { label: "Contacts", value: "11", icon: "👥" },
    { label: "Active Deals", value: "3", icon: "🤝" },
    { label: "Scans", value: "6", icon: "📷" },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans relative overflow-hidden">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-5 pt-12 pb-3 border-b border-[#1e3a5f]">
        {/* Back + title row */}
        <div className="flex items-center gap-2 mb-3">
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1e3a5f]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-[#94a3b8] text-[13px]">Opportunity Eye</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-white text-[13px] font-semibold">Hierarchy</span>
        </div>

        {/* Org identity row */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="w-14 h-14 rounded-2xl bg-[#1e3a5f] border border-[#6366f133] flex items-center justify-center flex-shrink-0 text-[22px]">
            🛡️
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-[16px] leading-tight">Lockheed Martin</span>
              {/* Scan origin badge */}
              <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f125] text-[#818cf8] border border-[#6366f133]">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
                via Eye
              </span>
            </div>
            <p className="text-[#64748b] text-[11px] font-mono mt-0.5">NAICS 336414 · Guided Missiles</p>
            <p className="text-[#475569] text-[10px] mt-0.5">SAM.gov entity · Bethesda, MD</p>
          </div>
        </div>

        {/* Metrics strip */}
        <div className="flex gap-2 mt-3">
          {metrics.map((m) => (
            <div key={m.label} className="flex-1 bg-[#0d2040] border border-[#1e3a5f] rounded-xl px-2 py-2 flex flex-col items-center gap-0.5">
              <span className="text-[14px]">{m.icon}</span>
              <span className="text-white font-bold text-[16px] leading-none">{m.value}</span>
              <span className="text-[#475569] text-[9px] font-medium">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Long-press hint ──────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-5 py-2 border-b border-[#1e3a5f]">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="text-[10px] text-[#475569]">Hold any contact for quick actions · Tap chevron to expand</span>
      </div>

      {/* ── Tree ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-28">
        {departments.map((dept) => (
          <DeptSection key={dept.id} dept={dept} />
        ))}
      </div>

      {/* ── FAB ──────────────────────────────────────────────── */}
      <div className="absolute bottom-7 right-5 flex flex-col items-end gap-2.5">
        {fabOpen && (
          <>
            {/* Option 1 */}
            <div className="flex items-center gap-2.5 animate-fade-in">
              <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3 py-2 shadow-xl">
                <span className="text-white text-[12px] font-semibold whitespace-nowrap">Add Manual Contact</span>
              </div>
              <button className="w-11 h-11 rounded-full bg-[#10b981] flex items-center justify-center shadow-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            {/* Option 2 */}
            <div className="flex items-center gap-2.5 animate-fade-in">
              <div className="bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3 py-2 shadow-xl">
                <span className="text-white text-[12px] font-semibold whitespace-nowrap">Scan Card into this Org</span>
              </div>
              <button className="w-11 h-11 rounded-full bg-[#6366f1] flex items-center justify-center shadow-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                </svg>
              </button>
            </div>
          </>
        )}
        {/* Main FAB */}
        <button
          className="w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200"
          style={{ backgroundColor: fabOpen ? "#ef4444" : "#6366f1", transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)" }}
          onClick={() => setFabOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* FAB backdrop */}
      {fabOpen && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setFabOpen(false)} />
      )}

      {/* Route badge */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2">
        <span className="text-[9px] text-[#334155] font-mono bg-[#0d2040] px-2.5 py-0.5 rounded-full border border-[#1e3a5f]">
          /org/[id]/hierarchy
        </span>
      </div>
    </div>
  );
}
