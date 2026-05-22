import { useState } from "react";

const sources = [
  "Cold Outreach",
  "Referral",
  "Google Ads",
  "Organic Search",
  "Charity / Giveaway",
  "Partnership",
  "Conference / Event",
  "LinkedIn",
  "Trade Show",
  "Existing Relationship",
];

const org = { name: "Memorial Health System", emoji: "🏥", type: "Health System", typeColor: "#6366f1" };

export function OpportunityEventForm() {
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const charCount = notes.length;
  const canAnalyze = notes.trim().length > 20 && source;

  const handleAnalyze = () => {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setTimeout(() => setAnalyzing(false), 2200);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a1628] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-12 pb-3 border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2 mb-3">
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1e3a5f]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-[17px] leading-tight">New Opportunity Event</h1>
            <p className="text-[#64748b] text-[11px]">Describe what happened — Grok will do the rest</p>
          </div>
        </div>

        {/* Org strip */}
        <div className="flex items-center gap-2.5 bg-[#0d1f3a] border border-[#1e3a5f] rounded-xl px-3 py-2"
          style={{ borderLeftWidth: 3, borderLeftColor: org.typeColor }}>
          <span className="text-[16px]">{org.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-[12px] truncate">{org.name}</p>
            <p className="text-[#64748b] text-[10px]">{org.type}</p>
          </div>
          <button className="text-[#6366f1] text-[10px] font-semibold">Change</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {/* Main text area */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[#94a3b8] text-[11px] font-semibold uppercase tracking-wider">Event Notes</label>
            <span className="text-[#334155] text-[10px]">{charCount} chars</span>
          </div>
          <div className="relative">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={10}
              placeholder={"Tell us what happened…\n\n• Key contacts met and their roles\n• Topics discussed & decisions made\n• Pipeline changes or new opportunities\n• Objections raised\n• Marketing materials left / promised\n• Agreed next steps\n• Any competitive intel"}
              className="w-full bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-4 py-3.5 text-white text-[13px] leading-relaxed placeholder-[#334155] resize-none outline-none focus:border-[#6366f155]"
              style={{ fontFamily: "inherit", caretColor: "#6366f1" }}
            />
            {notes.length === 0 && (
              <div className="absolute bottom-3 right-3 flex gap-1">
                {["📞", "🤝", "📧", "📍"].map(e => (
                  <button key={e} className="text-[16px] opacity-40 hover:opacity-80">{e}</button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[#334155] text-[10px] mt-1.5 px-1">
            The more detail you provide, the better Grok can extract structured data.
          </p>
        </div>

        {/* Source dropdown */}
        <div className="mb-5">
          <label className="text-[#94a3b8] text-[11px] font-semibold uppercase tracking-wider mb-2 block">
            Source <span className="text-[#ef4444]">*</span>
          </label>
          <button
            onClick={() => setSourceOpen(o => !o)}
            className="w-full flex items-center justify-between bg-[#0d1f3a] border rounded-2xl px-4 py-3.5"
            style={{ borderColor: source ? "#6366f155" : "#1e3a5f" }}>
            <span className={source ? "text-white text-[13px] font-semibold" : "text-[#334155] text-[13px]"}>
              {source || "Select event source…"}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: sourceOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {sourceOpen && (
            <div className="mt-1 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl overflow-hidden shadow-xl">
              {sources.map(s => (
                <button key={s}
                  onClick={() => { setSource(s); setSourceOpen(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-[#1e3a5f] last:border-0 text-left">
                  <span className="text-white text-[13px]">{s}</span>
                  {source === s && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date/time row */}
        <div className="flex gap-2 mb-5">
          <div className="flex-1 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3.5 py-3">
            <p className="text-[#475569] text-[10px] mb-0.5">Date</p>
            <p className="text-white text-[13px] font-semibold">Today, May 22</p>
          </div>
          <div className="flex-1 bg-[#0d1f3a] border border-[#1e3a5f] rounded-2xl px-3.5 py-3">
            <p className="text-[#475569] text-[10px] mb-0.5">Time</p>
            <p className="text-white text-[13px] font-semibold">12:30 PM</p>
          </div>
        </div>

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={!canAnalyze || analyzing}
          className="w-full rounded-2xl py-4 flex items-center justify-center gap-3 transition-all"
          style={{
            backgroundColor: canAnalyze ? "#10b981" : "#1e3a5f",
            opacity: analyzing ? 0.8 : 1,
          }}>
          {analyzing ? (
            <>
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <span className="text-white font-bold text-[15px]">Analyzing with Grok…</span>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span className={`font-bold text-[15px] ${canAnalyze ? "text-white" : "text-[#475569]"}`}>
                Analyze with Grok
              </span>
            </>
          )}
        </button>

        {!canAnalyze && (
          <p className="text-center text-[#334155] text-[10px] mt-2">
            Add event notes and select a source to continue
          </p>
        )}
      </div>
    </div>
  );
}
