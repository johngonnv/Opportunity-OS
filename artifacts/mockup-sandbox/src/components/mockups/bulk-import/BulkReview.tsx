const rows = [
  { name: "Mercy General Hospital", type: "HOSPITAL", address: "4001 J St", city: "Sacramento", state: "CA", zip: "95819", status: "ready", issues: [] },
  { name: "St. Rose Ambulatory", type: "AMBULATORY_SURGERY", address: "102 E Lake Mead Pkwy", city: "Henderson", state: "NV", zip: "89015", status: "ready", issues: [] },
  { name: "HCA Sunrise Medical Ctr", type: "HOSPITAL", address: "3186 S Maryland Pkwy", city: "Las Vegas", state: "NV", zip: "89109", status: "ready", issues: [] },
  { name: "ValleyCare Health System", type: "HEALTH_SYSTEM", address: "5555 W Las Positas Blvd", city: "Pleasanton", state: "CA", zip: "94588", status: "warning", issues: ["Phone format may be invalid"] },
  { name: "Desert Springs SNF", type: "SKILLED_NURSING", address: "2075 N 16th St", city: "Phoenix", state: "AZ", zip: "", status: "warning", issues: ["Missing zip code"] },
  { name: "Physicians Group LLC", type: "PHYSICIAN_GROUP", address: "6001 E Grant Rd", city: "Tucson", state: "AZ", zip: "85712", status: "ready", issues: [] },
  { name: "Sierra Vista Imaging", type: "IMAGING_CENTER", address: "440 Kirman Ave", city: "Reno", state: "NV", zip: "89502", status: "ready", issues: [] },
  { name: "", type: "", address: "", city: "Portland", state: "OR", zip: "", status: "error", issues: ["Name is required"] },
];

const statusColors: Record<string, string> = {
  ready: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
};

const typeShort: Record<string, string> = {
  HOSPITAL: "Hospital",
  AMBULATORY_SURGERY: "ASC",
  HEALTH_SYSTEM: "Health System",
  SKILLED_NURSING: "SNF",
  PHYSICIAN_GROUP: "Phys. Group",
  IMAGING_CENTER: "Imaging",
};

export function BulkReview() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18]">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center px-4 pt-14 pb-4 border-b border-[#253048]">
          <div className="flex-1 text-center text-white text-[17px] font-bold">Review Import</div>
        </div>

        {/* Summary bar */}
        <div className="flex border-b border-[#253048] bg-[#111827]">
          {[
            { num: 47, label: "detected", color: "#F1F5F9" },
            { num: 40, label: "ready", color: "#10B981" },
            { num: 5, label: "warnings", color: "#F59E0B" },
            { num: 2, label: "errors", color: "#EF4444" },
          ].map((s, i, arr) => (
            <div key={i} className={`flex-1 flex flex-col items-center py-3 ${i < arr.length-1 ? "border-r border-[#253048]" : ""}`}>
              <span className="text-[18px] font-black" style={{color:s.color}}>{s.num}</span>
              <span className="text-[10px] text-[#64748B]">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Selected bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#10B981]/10">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          <span className="text-[12px] text-[#10B981] font-semibold">45 of 47 selected for import</span>
        </div>

        {/* Row list */}
        <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-2" style={{paddingBottom:"140px"}}>
          {rows.map((row, i) => {
            const sc = statusColors[row.status];
            return (
              <div key={i} className={`flex items-start gap-2.5 bg-[#111827] rounded-xl border border-[#253048] px-3 py-3 ${row.status === "error" ? "opacity-50" : ""}`}>
                {/* Checkbox */}
                <div className="pt-0.5 flex-shrink-0">
                  {row.status === "error" ? (
                    <div className="w-4 h-4 rounded border border-[#64748B]" />
                  ) : (
                    <div className="w-4 h-4 rounded bg-[#10B981]/20 border border-[#10B981] flex items-center justify-center">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-white truncate">{row.name || "—"}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{backgroundColor: sc+"22", color: sc}}>{row.status}</span>
                  </div>
                  {(row.type || row.city) && (
                    <p className="text-[11px] text-[#64748B] mt-0.5">{[typeShort[row.type], [row.city, row.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
                  )}
                  {row.address && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <p className="text-[10px] text-[#64748B]">{row.address}, {row.city}, {row.state}{row.zip ? " " + row.zip : ""}</p>
                    </div>
                  )}
                  {row.issues.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span className="text-[11px] text-[#F59E0B]">{row.issues[0]}</span>
                    </div>
                  )}
                </div>

                {/* Edit */}
                <button className="p-1 flex-shrink-0 mt-0.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#070D18] border-t border-[#253048] px-4 pt-3 pb-8">
          <div className="flex gap-2 mb-3">
            {["Re-process", "Error Report", "Cancel"].map((label, i) => (
              <button key={i} className="flex-1 flex items-center justify-center gap-1.5 border border-[#253048] rounded-lg py-2.5 bg-[#111827]">
                <span className="text-[11px] font-semibold text-[#94A3B8]">{label}</span>
              </button>
            ))}
          </div>
          <button className="w-full bg-[#10B981] rounded-xl py-4 flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
            <span className="text-white text-[15px] font-bold">Import 45 Valid Records</span>
          </button>
        </div>
      </div>
    </div>
  );
}
