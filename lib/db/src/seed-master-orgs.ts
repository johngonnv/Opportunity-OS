import { db } from "./index";
import { masterOrganizationsTable, masterOrganizationRelationshipsTable } from "./schema";
import { eq } from "drizzle-orm";

const LEGAL_SUFFIXES = [
  "incorporated", "inc", "corporation", "corp", "limited liability company",
  "llc", "limited", "ltd", "company", "co", "lp", "llp", "plc",
  "association", "assoc", "foundation", "health system", "health systems",
  "health network", "healthcare", "health care", "hospital system",
  "medical center", "medical group", "medical", "hospital", "hospitals",
];

function normalizeOrgName(name: string): string {
  let n = name.toLowerCase().trim();
  n = n.replace(/[^a-z0-9\s]/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  for (const suffix of LEGAL_SUFFIXES) {
    const pattern = new RegExp(`\\b${suffix.replace(/\s+/g, "\\s+")}\\b`, "g");
    n = n.replace(pattern, "").trim();
  }
  return n.replace(/\s+/g, " ").trim();
}

const orgDefs = [
  { key: "hca",           canonicalName: "HCA Healthcare",                           websiteDomain: "hcahealthcare.com",         aliases: ["HCA", "HCA Hospitals", "Hospital Corporation of America"],        headquartersAddress: "One Park Plaza, Nashville, TN 37203",              notes: "Largest US for-profit hospital chain" },
  { key: "commonspirit",  canonicalName: "CommonSpirit Health",                       websiteDomain: "commonspirit.org",           aliases: ["Common Spirit Health", "CommonSpirit"],                             headquartersAddress: "444 W Lake St, Chicago, IL 60606",                 notes: null },
  { key: "dignityhealth", canonicalName: "Dignity Health",                            websiteDomain: "dignityhealth.org",          aliases: ["Dignity Health Medical Group", "CHI Dignity Health"],               headquartersAddress: "185 Berry St Suite 300, San Francisco, CA 94107",  notes: "Merged with Catholic Health Initiatives to form CommonSpirit" },
  { key: "uhs",           canonicalName: "Universal Health Services",                 websiteDomain: "uhsinc.com",                 aliases: ["UHS", "UHS Inc"],                                                   headquartersAddress: "367 S Gulph Rd, King of Prussia, PA 19406",        notes: null },
  { key: "tenet",         canonicalName: "Tenet Healthcare",                          websiteDomain: "tenethealth.com",            aliases: ["Tenet Health"],                                                     headquartersAddress: "14201 Dallas Pkwy, Dallas, TX 75254",              notes: null },
  { key: "ascension",     canonicalName: "Ascension Health",                          websiteDomain: "ascension.org",              aliases: ["Ascension", "Ascension Healthcare"],                                 headquartersAddress: "101 S Hanley Rd, St. Louis, MO 63105",             notes: null },
  { key: "adventhealth",  canonicalName: "AdventHealth",                              websiteDomain: "adventhealth.com",           aliases: ["Adventist Health System", "Advent Health"],                         headquartersAddress: "900 Hope Way, Altamonte Springs, FL 32714",        notes: null },
  { key: "providence",    canonicalName: "Providence Health & Services",               websiteDomain: "providence.org",             aliases: ["Providence", "Providence St. Joseph Health"],                       headquartersAddress: "1801 Lind Ave SW, Renton, WA 98057",               notes: null },
  { key: "banner",        canonicalName: "Banner Health",                             websiteDomain: "bannerhealth.com",           aliases: ["Banner"],                                                           headquartersAddress: "2901 N Central Ave, Phoenix, AZ 85012",            notes: null },
  { key: "mayo",          canonicalName: "Mayo Clinic",                               websiteDomain: "mayoclinic.org",             aliases: ["Mayo Clinic Health System"],                                        headquartersAddress: "200 First St SW, Rochester, MN 55905",             notes: null },
  { key: "renown",        canonicalName: "Renown Health",                             websiteDomain: "renown.org",                 aliases: ["Renown Regional Medical Center", "Renown"],                         headquartersAddress: "1155 Mill St, Reno, NV 89502",                     notes: "Northern Nevada's largest not-for-profit health system" },
  { key: "valleyhealth",  canonicalName: "Valley Health System",                      websiteDomain: "valleyhealthsystem.org",     aliases: ["Valley Health System Nevada", "VHS"],                               headquartersAddress: "3300 Sirius Ave, Las Vegas, NV 89102",             notes: null },
  { key: "desertsprings", canonicalName: "Desert Springs Hospital Medical Center",    websiteDomain: "desertspringshospital.com",  aliases: ["Desert Springs Hospital"],                                          headquartersAddress: "2075 E Flamingo Rd, Las Vegas, NV 89119",          notes: null },
  { key: "sunrise",       canonicalName: "Sunrise Hospital and Medical Center",       websiteDomain: "sunrisehospital.com",        aliases: ["Sunrise Hospital", "Sunrise Medical Center"],                       headquartersAddress: "3186 S Maryland Pkwy, Las Vegas, NV 89109",        notes: null },
  { key: "springvalley",  canonicalName: "Spring Valley Hospital Medical Center",     websiteDomain: "springvalleyhospital.com",   aliases: ["Spring Valley Hospital"],                                           headquartersAddress: "5400 S Rainbow Blvd, Las Vegas, NV 89118",         notes: null },
  { key: "umc",           canonicalName: "University Medical Center of Southern Nevada", websiteDomain: "umcsn.com",              aliases: ["UMC", "UMC Southern Nevada", "University Medical Center Las Vegas"], headquartersAddress: "1800 W Charleston Blvd, Las Vegas, NV 89102",      notes: "Clark County's only Level I Trauma Center" },
  { key: "st_marys",      canonicalName: "St. Mary's Regional Medical Center",        websiteDomain: "stmarysreno.com",            aliases: ["St. Mary's Reno", "Saint Mary's Regional Medical Center"],          headquartersAddress: "235 W 6th St, Reno, NV 89503",                    notes: null },
  { key: "mountainview",  canonicalName: "MountainView Hospital",                     websiteDomain: "mountainview-hospital.com",  aliases: ["Mountain View Hospital Las Vegas", "MountainView"],                 headquartersAddress: "3100 N Tenaya Way, Las Vegas, NV 89128",           notes: null },
  { key: "henderson",     canonicalName: "Henderson Hospital",                        websiteDomain: "hendersonhospital.com",      aliases: ["Henderson Hospital Nevada"],                                        headquartersAddress: "1050 W Galleria Dr, Henderson, NV 89011",          notes: null },
  { key: "summerlin",     canonicalName: "Summerlin Hospital Medical Center",         websiteDomain: "summerlinhosp.com",          aliases: ["Summerlin Hospital"],                                               headquartersAddress: "657 N Town Center Dr, Las Vegas, NV 89144",        notes: null },
];

const relDefs: Array<{ parentKey: string; childKey: string; type: "SUBSIDIARY" | "REGIONAL" | "DBA" | "AFFILIATED"; evidence: string }> = [
  { parentKey: "commonspirit",  childKey: "dignityhealth",  type: "SUBSIDIARY", evidence: "Dignity Health merged with Catholic Health Initiatives to form CommonSpirit Health in 2019" },
  { parentKey: "uhs",           childKey: "desertsprings",  type: "SUBSIDIARY", evidence: "Desert Springs Hospital Medical Center is owned by Universal Health Services" },
  { parentKey: "uhs",           childKey: "springvalley",   type: "SUBSIDIARY", evidence: "Spring Valley Hospital Medical Center is owned by Universal Health Services" },
  { parentKey: "uhs",           childKey: "henderson",      type: "SUBSIDIARY", evidence: "Henderson Hospital is owned by Universal Health Services" },
  { parentKey: "uhs",           childKey: "summerlin",      type: "SUBSIDIARY", evidence: "Summerlin Hospital Medical Center is owned by Universal Health Services" },
  { parentKey: "hca",           childKey: "mountainview",   type: "SUBSIDIARY", evidence: "MountainView Hospital is part of the HCA Healthcare family" },
  { parentKey: "hca",           childKey: "sunrise",        type: "SUBSIDIARY", evidence: "Sunrise Hospital is part of HCA Healthcare's Southern Nevada network" },
  { parentKey: "valleyhealth",  childKey: "desertsprings",  type: "REGIONAL",   evidence: "Desert Springs Hospital operates under Valley Health System brand in Southern Nevada" },
  { parentKey: "valleyhealth",  childKey: "springvalley",   type: "REGIONAL",   evidence: "Spring Valley Hospital operates under Valley Health System brand" },
  { parentKey: "valleyhealth",  childKey: "henderson",      type: "REGIONAL",   evidence: "Henderson Hospital operates under Valley Health System brand" },
  { parentKey: "valleyhealth",  childKey: "summerlin",      type: "REGIONAL",   evidence: "Summerlin Hospital operates under Valley Health System brand" },
  { parentKey: "valleyhealth",  childKey: "mountainview",   type: "REGIONAL",   evidence: "MountainView Hospital operates under Valley Health System brand" },
  { parentKey: "valleyhealth",  childKey: "sunrise",        type: "REGIONAL",   evidence: "Sunrise Hospital operates under Valley Health System brand" },
  { parentKey: "dignityhealth", childKey: "st_marys",       type: "SUBSIDIARY", evidence: "St. Mary's Regional Medical Center Reno is a Dignity Health facility" },
];

async function seed() {
  console.log("[SEED] Starting master organization seed...");
  const idMap: Record<string, string> = {};

  for (const org of orgDefs) {
    const existing = await db.select({ id: masterOrganizationsTable.id })
      .from(masterOrganizationsTable)
      .where(eq(masterOrganizationsTable.canonicalName, org.canonicalName))
      .limit(1);

    if (existing.length > 0) {
      idMap[org.key] = existing[0].id;
      console.log(`[SEED] Already exists: ${org.canonicalName} (${existing[0].id})`);
      continue;
    }

    const id = crypto.randomUUID();
    const [inserted] = await db.insert(masterOrganizationsTable).values({
      id,
      canonicalName: org.canonicalName,
      normalizedName: normalizeOrgName(org.canonicalName),
      websiteDomain: org.websiteDomain ?? null,
      aliases: org.aliases ?? [],
      headquartersAddress: org.headquartersAddress ?? null,
      notes: org.notes ?? null,
    }).returning({ id: masterOrganizationsTable.id });
    idMap[org.key] = inserted.id;
    console.log(`[SEED] Inserted: ${org.canonicalName} (${inserted.id})`);
  }

  console.log("[SEED] Inserting relationships...");
  for (const rel of relDefs) {
    const parentId = idMap[rel.parentKey];
    const childId = idMap[rel.childKey];
    if (!parentId || !childId) {
      console.log(`[SEED] Skipping ${rel.parentKey} -> ${rel.childKey} (missing IDs)`);
      continue;
    }
    try {
      await db.insert(masterOrganizationRelationshipsTable).values({
        id: crypto.randomUUID(),
        parentMasterOrganizationId: parentId,
        childMasterOrganizationId: childId,
        relationshipType: rel.type,
        confidenceScore: 0.95,
        evidenceSummary: rel.evidence,
      });
      console.log(`[SEED] Relationship: ${rel.parentKey} -> ${rel.childKey} (${rel.type})`);
    } catch (err: any) {
      console.log(`[SEED] Relationship skip (may exist): ${err?.message?.slice(0, 80)}`);
    }
  }

  console.log("[SEED] Done.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("[SEED] Fatal:", err);
  process.exit(1);
});
