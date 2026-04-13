/**
 * Seed: GovCon Opportunities
 *
 * Inserts 15+ realistic mock govcon_opportunities covering EMS transport,
 * healthcare IT, GovCon consulting, and government contracting verticals.
 *
 * Run via: pnpm --filter @workspace/db run seed:govcon-opportunities
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { govconOpportunitiesTable } from "../schema/govcon";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const opportunities = [
  {
    id: crypto.randomUUID(),
    title: "EMS Ground Ambulance Transport Services — VA National Capital Region",
    naicsCode: "621910",
    pscCode: "V225",
    agency: "Department of Veterans Affairs",
    region: "Mid-Atlantic",
    primeOrSubFit: "PRIME" as const,
    summary: "Multi-year BPA for emergency and non-emergency ground ambulance transport services for VA medical centers in the National Capital Region. Includes 24/7 coverage, ALS/BLS capability, and NEMSIS-compliant reporting.",
    source: "SAM.gov",
    solicitationNumber: "36C24224R0011",
    estimatedValue: "$18M",
    responseDeadline: "2025-09-30",
  },
  {
    id: crypto.randomUUID(),
    title: "Healthcare IT Modernization — EHR Integration Services",
    naicsCode: "541512",
    pscCode: "DA01",
    agency: "Department of Health and Human Services",
    region: "National",
    primeOrSubFit: "BOTH" as const,
    summary: "Modernization of legacy electronic health record systems across HHS operating divisions. Includes FHIR R4 API integration, HL7 v2 migration, data normalization, and change management support.",
    source: "SAM.gov",
    solicitationNumber: "75N97124R00021",
    estimatedValue: "$45M",
    responseDeadline: "2025-11-15",
  },
  {
    id: crypto.randomUUID(),
    title: "Program Management Support — DoD Health Affairs",
    naicsCode: "541611",
    pscCode: "R408",
    agency: "Department of Defense",
    region: "National Capital Region",
    primeOrSubFit: "PRIME" as const,
    summary: "Program management and administrative support for DoD Health Affairs portfolio. Requires PMP-certified staff, ISO 9001 processes, and experience with military healthcare IT programs.",
    source: "SAM.gov",
    solicitationNumber: "HT001524R0002",
    estimatedValue: "$12M",
    responseDeadline: "2025-08-31",
  },
  {
    id: crypto.randomUUID(),
    title: "Facilities Management Services — DHS Field Offices",
    naicsCode: "561210",
    pscCode: "R406",
    agency: "Department of Homeland Security",
    region: "Southeast",
    primeOrSubFit: "BOTH" as const,
    summary: "Full-service facilities support for DHS field offices across 8 southeastern states. Services include building maintenance, custodial, grounds keeping, and minor construction.",
    source: "SAM.gov",
    solicitationNumber: "70RDND24R00003",
    estimatedValue: "$22M",
    responseDeadline: "2025-10-01",
  },
  {
    id: crypto.randomUUID(),
    title: "Medical Records Digitization and Analytics Platform",
    naicsCode: "541512",
    pscCode: "DA01",
    agency: "Department of Veterans Affairs",
    region: "National",
    primeOrSubFit: "BOTH" as const,
    summary: "Design, development, and deployment of a cloud-native platform to digitize 30M+ legacy VA medical records. Includes ML-powered classification, OCR pipelines, and FISMA High ATO support.",
    source: "SAM.gov",
    solicitationNumber: "36C10B24R0009",
    estimatedValue: "$67M",
    responseDeadline: "2025-12-01",
  },
  {
    id: crypto.randomUUID(),
    title: "Ambulance Services — BPA with Federal Bureau of Prisons",
    naicsCode: "621910",
    pscCode: "Q529",
    agency: "Department of Justice",
    region: "National",
    primeOrSubFit: "PRIME" as const,
    summary: "Blanket purchase agreement for emergency medical transport services at BOP facilities nationwide. Vendor must maintain minimum ALS staffing ratios and CAAS accreditation.",
    source: "SAM.gov",
    solicitationNumber: "15B10924Q00012",
    estimatedValue: "$8M",
    responseDeadline: "2025-07-15",
  },
  {
    id: crypto.randomUUID(),
    title: "IT Network Infrastructure Modernization — NIH Campus",
    naicsCode: "541512",
    pscCode: "DG01",
    agency: "Department of Health and Human Services",
    region: "Mid-Atlantic",
    primeOrSubFit: "PRIME" as const,
    summary: "Design and implementation of zero-trust network architecture across NIH main campus. Includes SD-WAN deployment, network segmentation, and 24x7 NOC services.",
    source: "SAM.gov",
    solicitationNumber: "75N97124R00056",
    estimatedValue: "$31M",
    responseDeadline: "2025-09-15",
  },
  {
    id: crypto.randomUUID(),
    title: "GovCon Strategic Advisory Services — NAVSEA",
    naicsCode: "541690",
    pscCode: "R408",
    agency: "Department of Defense",
    region: "Southeast",
    primeOrSubFit: "SUB" as const,
    summary: "Strategic consulting and analysis services for NAVSEA acquisition modernization program. Requires knowledge of DoD acquisition regulations, FARs, and DFARS compliance.",
    source: "SAM.gov",
    solicitationNumber: "N00024-24-R-4044",
    estimatedValue: "$9M",
    responseDeadline: "2025-08-01",
  },
  {
    id: crypto.randomUUID(),
    title: "Administrative Management Support — CMS Medicare Operations",
    naicsCode: "561110",
    pscCode: "R406",
    agency: "Department of Health and Human Services",
    region: "Mid-Atlantic",
    primeOrSubFit: "BOTH" as const,
    summary: "Administrative and operational support for CMS Medicare fee-for-service processing operations. Includes claims support, training delivery, and quality monitoring.",
    source: "SAM.gov",
    solicitationNumber: "75FCMC24R0021",
    estimatedValue: "$14M",
    responseDeadline: "2025-10-31",
  },
  {
    id: crypto.randomUUID(),
    title: "Physician Primary Care Services — TRICARE Managed Care",
    naicsCode: "621111",
    pscCode: "Q2",
    agency: "Department of Defense",
    region: "Southeast",
    primeOrSubFit: "PRIME" as const,
    summary: "Primary care physician services for TRICARE beneficiaries in the Southeast region. Must be credentialed under TRICARE preferred provider program and accept TRICARE Prime.",
    source: "SAM.gov",
    solicitationNumber: "HT009424R00008",
    estimatedValue: "$5M",
    responseDeadline: "2025-07-31",
  },
  {
    id: crypto.randomUUID(),
    title: "IT Management and Governance — FEMA Enterprise Operations",
    naicsCode: "541512",
    pscCode: "DF01",
    agency: "Department of Homeland Security",
    region: "National Capital Region",
    primeOrSubFit: "PRIME" as const,
    summary: "End-to-end IT governance, portfolio management, and enterprise architecture services for FEMA. Requires TOGAF-certified staff and experience with NIST Risk Management Framework.",
    source: "SAM.gov",
    solicitationNumber: "70FBR524R00002",
    estimatedValue: "$19M",
    responseDeadline: "2025-11-30",
  },
  {
    id: crypto.randomUUID(),
    title: "Janitorial and Custodial Services — GSA Federal Buildings Southeast",
    naicsCode: "561720",
    pscCode: "R406",
    agency: "General Services Administration",
    region: "Southeast",
    primeOrSubFit: "PRIME" as const,
    summary: "Comprehensive custodial and janitorial services for 14 GSA-managed federal buildings across Georgia, Alabama, and Mississippi. SDVOSB set-aside.",
    source: "SAM.gov",
    solicitationNumber: "47PF0024R0005",
    estimatedValue: "$6M",
    responseDeadline: "2025-08-15",
  },
  {
    id: crypto.randomUUID(),
    title: "Scientific and Technical Consulting — EPA Climate Research",
    naicsCode: "541690",
    pscCode: "R408",
    agency: "Environmental Protection Agency",
    region: "National",
    primeOrSubFit: "BOTH" as const,
    summary: "Scientific advisory and technical consulting services supporting EPA climate adaptation research programs. Requires PhD-level staff in environmental science and public health.",
    source: "SAM.gov",
    solicitationNumber: "68HE0224R0003",
    estimatedValue: "$7.5M",
    responseDeadline: "2025-09-01",
  },
  {
    id: crypto.randomUUID(),
    title: "Healthcare Analytics and Population Health Platform — Indian Health Service",
    naicsCode: "541512",
    pscCode: "DA01",
    agency: "Department of Health and Human Services",
    region: "Southwest",
    primeOrSubFit: "BOTH" as const,
    summary: "Cloud-based population health analytics and chronic disease management platform for IHS tribal health programs. Must integrate with Resource and Patient Management System (RPMS).",
    source: "SAM.gov",
    solicitationNumber: "75H70724R00015",
    estimatedValue: "$28M",
    responseDeadline: "2025-10-15",
  },
  {
    id: crypto.randomUUID(),
    title: "Mental Health Physician Services — VA VISN 5",
    naicsCode: "621112",
    pscCode: "Q2",
    agency: "Department of Veterans Affairs",
    region: "Mid-Atlantic",
    primeOrSubFit: "PRIME" as const,
    summary: "Psychiatry and mental health physician staffing for VA VISN 5 facilities including DC VAMC and Baltimore VAMC. Board-certified psychiatrists required; must hold active DEA license.",
    source: "SAM.gov",
    solicitationNumber: "36C24424Q0028",
    estimatedValue: "$4.2M",
    responseDeadline: "2025-07-20",
  },
  {
    id: crypto.randomUUID(),
    title: "Management Consulting — HHS Office of Inspector General Transformation",
    naicsCode: "541611",
    pscCode: "R408",
    agency: "Department of Health and Human Services",
    region: "National Capital Region",
    primeOrSubFit: "PRIME" as const,
    summary: "Strategic transformation consulting for HHS OIG including organizational design, process optimization, and performance management framework development.",
    source: "SAM.gov",
    solicitationNumber: "75N98024R0001",
    estimatedValue: "$11M",
    responseDeadline: "2025-09-30",
  },
];

async function seedOpportunities() {
  console.log(`Seeding ${opportunities.length} GovCon opportunities...`);

  let inserted = 0;
  let skipped = 0;

  for (const opp of opportunities) {
    try {
      await db.insert(govconOpportunitiesTable)
        .values({
          ...opp,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      inserted++;
    } catch (err) {
      console.error(`Failed to insert "${opp.title}":`, err);
      skipped++;
    }
  }

  console.log(`Done. Inserted: ${inserted}, Skipped: ${skipped}`);
  await pool.end();
}

seedOpportunities().catch(err => {
  console.error(err);
  process.exit(1);
});
