const orgData = {
  name: "Mercy General Hospital",
  website: "mercygeneral.org",
  websiteStatus: "verified",
  googleRating: 4.2,
  googleReviews: 1840,
  gmb: "Google Business · verified listing",
  beds: "336 beds",
  founded: "1897",
  npi: "1902840155",
  ein: "94-100####",
  system: "Trinity Health",
  address: "4001 J St, Sacramento, CA 95819",
  mainPhone: "(916) 453-4545",
  billingPhone: "(916) 453-4547",
  fax: "(916) 453-4601",
};

const sources = [
  {
    type: "Website",
    icon: "🌐",
    color: "#10B981",
    url: "mercygeneral.org",
    status: "live",
    found: ["Leadership page", "Departments & services", "Main phone + fax", "Address verified"],
    confidence: 98,
  },
  {
    type: "Google Business",
    icon: "📍",
    color: "#F59E0B",
    url: "Google Maps listing",
    status: "live",
    found: ["4.2 ★ (1,840 reviews)", "Hours of operation", "Phone verified", "Directions + photos"],
    confidence: 96,
  },
  {
    type: "NPI Registry",
    icon: "🏛️",
    color: "#6366f1",
    url: "npiregistry.cms.hhs.gov",
    status: "live",
    found: [`NPI: ${orgData.npi}`, "Type II (Organization)", "Taxonomy: General Acute Care", "Active status"],
    confidence: 100,
  },
  {
    type: "LinkedIn Page",
    icon: "💼",
    color: "#0EA5E9",
    url: "linkedin.com/company/mercy-general",
    status: "live",
    found: ["3,400 employees listed", "18 open positions", "2 mutual connections", "Company updates"],
    confidence: 87,
  },
  {
    type: "SEC / EIN",
    icon: "📄",
    color: "#94A3B8",
    url: "IRS nonprofit records",
    status: "partial",
    found: ["EIN: 94-100####", "501(c)(3) nonprofit"],
    confidence: 71,
  },
];

const enrichedFields = [
  { label: "Main Phone", value: orgData.mainPhone, source: "website + GMB", verified: true },
  { label: "Billing Dept", value: orgData.billingPhone, source: "website", verified: true },
  { label: "Fax", value: orgData.fax, source: "website", verified: true },
  { label: "NPI Number", value: orgData.npi, source: "NPI registry", verified: true },
  { label: "Bed Count", value: orgData.beds, source: "CMS hospital compare", verified: true },
  { label: "Health System", value: orgData.system, source: "NPI + website", verified: true },
  { label: "Founded", value: orgData.founded, source: "LinkedIn", verified: false },
];

export function GrokSEOEnrichment() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070D18]">
      <div className="w-[390px] h-[844px] bg-[#070D18] flex flex-col overflow-hidden" style={{fontFamily:"Inter,system-ui,sans-serif"}}>
        {/* Nav */}
        <div className="flex items-center px-4 pt-14 pb-3 border-b border-[#253048]">
          <div className="flex-1 text-center text-white text-[16px] font-bold">Review Import</div>
        </div>

        {/* Grok banner */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#6366f1]/12 border-b border-[#6366f1]/25">
          <div className="w-5 h-5 rounded bg-[#6366f1] flex items-center justify-center flex-shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <p className="text-[12px] text-[#a5b4fc] font-medium">Grok scanned public web for org-level data</p>
          <div className="ml-auto flex items-center gap-1 bg-[#10B981]/15 border border-[#10B981]/30 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            <span className="text-[9px] font-bold text-[#10B981]">5 sources</span>
          </div>
        </div>

        {/* Org header */}
        <div className="px-4 py-2.5 bg-[#111827] border-b border-[#253048] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#253048] flex items-center justify-center flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-white">{orgData.name}</p>
            <p className="text-[10px] text-[#64748B]">{orgData.address}</p>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-[#64748B]">Overall confidence</span>
            <span className="text-[13px] font-black text-[#10B981]">94%</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-3" style={{paddingBottom:"120px"}}>

          {/* Sources scanned */}
          <div>
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Sources Scanned</p>
            <div className="flex flex-col gap-1.5">
              {sources.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-[#111827] rounded-xl border border-[#253048] px-3 py-2.5">
                  <span className="text-[14px] flex-shrink-0 mt-0.5">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-white">{s.type}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${s.status === "live" ? "bg-[#10B981]/20 text-[#10B981]" : "bg-[#F59E0B]/20 text-[#F59E0B]"}`}>
                        {s.status === "live" ? "✓ found" : "partial"}
                      </span>
                      <span className="ml-auto text-[9px] font-bold" style={{color: s.color}}>{s.confidence}%</span>
                    </div>
                    <p className="text-[10px] text-[#6366f1] mb-1">{s.url}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {s.found.map((f, j) => (
                        <span key={j} className="text-[10px] text-[#94A3B8]">· {f}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Enriched fields */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Fields Enriched by Grok</p>
              <span className="text-[9px] bg-[#6366f1]/20 text-[#6366f1] px-1.5 py-0.5 rounded font-bold">AI</span>
            </div>
            <div className="bg-[#111827] rounded-xl border border-[#253048] divide-y divide-[#253048]/60">
              {enrichedFields.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.verified ? "bg-[#10B981]" : "bg-[#F59E0B]"}`} />
                  <span className="text-[10px] text-[#64748B] w-20 flex-shrink-0">{f.label}</span>
                  <span className="text-[11px] font-semibold text-white flex-1 truncate">{f.value}</span>
                  <span className="text-[9px] text-[#64748B] truncate max-w-[80px]">{f.source}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#64748B] mt-1.5">
              <span className="text-[#10B981]">●</span> Verified &nbsp;
              <span className="text-[#F59E0B]">●</span> Unverified — review before saving
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#070D18] border-t border-[#253048] px-4 pt-3 pb-8">
          <div className="flex gap-2 mb-3">
            <button className="flex-1 text-[11px] font-semibold text-[#6366f1] border border-[#6366f1]/30 bg-[#6366f1]/10 rounded-lg py-2.5">Apply All Fields</button>
            <button className="flex-1 text-[11px] font-semibold text-[#94A3B8] border border-[#253048] bg-[#111827] rounded-lg py-2.5">Review Manually</button>
          </div>
          <button className="w-full bg-[#10B981] rounded-xl py-4 flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span className="text-white text-[15px] font-bold">Continue to Contact Suggestions</span>
          </button>
        </div>
      </div>
    </div>
  );
}
