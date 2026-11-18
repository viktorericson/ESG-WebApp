import "server-only";
import JSZip from "jszip";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { env } from "./env";
import { storage } from "./storage";
import { generateToken } from "./tokens";

/**
 * Flytning af en hel koncern mellem to installationer (fx fra en lokal udviklingsdatabase til den
 * hostede platform): selskaber, lokationer, rapporteringsår, rapporter med tekster og billeder,
 * modulsvar med dokumentation, indsendelser, egne faktorsæt, adgange, logo, forsidefoto og farve.
 *
 * Pakken er en zip med data.json og filerne. Ved import får alt nye id'er; gamle id'er, der står
 * inde i svarene (fx en lokation valgt i scope 1), oversættes til de nye.
 *
 * Ikke med: licens (knyttes til den nye installation), aktivitetslog, invitationer og sessioner.
 * Globale faktorsæt (Klimakompasset) findes i forvejen og kobles på navn og version.
 */

export const TRANSFER_FORMAT = "esg-koncern";
export const TRANSFER_VERSION = 1;

type FileRef = { file: string; contentType: string };

type Bundle = {
  format: typeof TRANSFER_FORMAT;
  version: number;
  exportedAt: string;
  source: string;
  organization: { id: string; name: string; brandColor: string | null; logo: FileRef | null; cover: FileRef | null };
  companies: { id: string; parentId: string | null; name: string; cvr: string; address: string | null; legalForm: string | null; naceCodes: string[]; consolidate: boolean; createdAt: string; archivedAt: string | null }[];
  locations: {
    id: string;
    companyId: string;
    name: string;
    address: string;
    function: string | null;
    control: string;
    latitude: number | null;
    longitude: number | null;
    operationalFrom: string | null;
    operationalTo: string | null;
    archivedAt: string | null;
  }[];
  factorSets: {
    id: string;
    name: string;
    version: string;
    description: string | null;
    sourceUrl: string | null;
    factors: { year: number; key: string; mainCategory: string; category: string; parameter1: string | null; parameter2: string | null; unit: string; scope1: number; scope2: number; scope3: number; outsideScopes: number; source: string | null; customized: boolean }[];
  }[];
  periods: { id: string; year: number; startDate: string; endDate: string; factorSet: { own: string } | { name: string; version: string } | null }[];
  reports: {
    id: string;
    periodId: string;
    name: string;
    standardVersion: string;
    module: string;
    basis: string;
    reportingCompanyId: string;
    omissions: string | null;
    consolidatedTurnover: number | null;
    status: string;
    content: unknown;
    companyIds: string[];
    images: (FileRef & { slot: string; caption: string | null; sort: number; width: number; height: number })[];
  }[];
  moduleData: {
    periodId: string;
    moduleKey: string;
    companyId: string;
    locationId: string | null;
    answers: unknown;
    status: string;
    statusNote: string | null;
    updatedBy: string | null;
    attachments: (FileRef & { sectionKey: string; filename: string; size: number; uploadedBy: string | null })[];
  }[];
  submissions: { periodId: string; companyId: string; status: string; comment: string | null; submittedAt: string | null; submittedBy: string | null; reviewedAt: string | null; reviewedBy: string | null }[];
  members: { email: string; name: string | null; role: string; companyId: string | null; locationId: string | null }[];
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const date = (s: string | null | undefined) => (s ? new Date(s) : null);

/* ------------------------------------------------------------------ */
/* Eksport                                                             */
/* ------------------------------------------------------------------ */

export async function exportOrganization(orgId: string): Promise<{ buffer: Buffer; name: string; summary: TransferSummary }> {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: {
      companies: { include: { locations: true }, orderBy: { createdAt: "asc" } },
      factorSets: { include: { factors: true } },
      periods: { include: { factorSet: true }, orderBy: { year: "asc" } },
      memberships: { include: { user: true } },
    },
  });
  const periodIds = org.periods.map((p) => p.id);
  const [reports, moduleData, submissions] = await Promise.all([
    db.report.findMany({ where: { periodId: { in: periodIds } }, include: { companies: true, images: { orderBy: [{ slot: "asc" }, { sort: "asc" }] } } }),
    db.moduleData.findMany({ where: { periodId: { in: periodIds } }, include: { attachments: { include: { uploadedBy: true } }, updatedBy: true } }),
    db.companySubmission.findMany({ where: { periodId: { in: periodIds } }, include: { submittedBy: true, reviewedBy: true } }),
  ]);

  const zip = new JSZip();
  let n = 0;
  const addFile = async (key: string, contentType: string): Promise<FileRef> => {
    const name = `files/${++n}`;
    zip.file(name, await storage.get(key));
    return { file: name, contentType };
  };

  const bundle: Bundle = {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    source: env.appUrl,
    organization: {
      id: org.id,
      name: org.name,
      brandColor: org.brandColor,
      logo: org.logoKey ? await addFile(org.logoKey, org.logoContentType ?? "image/png") : null,
      cover: org.coverKey ? await addFile(org.coverKey, org.coverContentType ?? "image/jpeg") : null,
    },
    companies: org.companies.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      cvr: c.cvr,
      address: c.address,
      legalForm: c.legalForm,
      naceCodes: c.naceCodes,
      consolidate: c.consolidate,
      createdAt: c.createdAt.toISOString(),
      archivedAt: iso(c.archivedAt),
    })),
    locations: org.companies.flatMap((c) =>
      c.locations.map((l) => ({
        id: l.id,
        companyId: c.id,
        name: l.name,
        address: l.address,
        function: l.function,
        control: l.control,
        latitude: l.latitude,
        longitude: l.longitude,
        operationalFrom: iso(l.operationalFrom),
        operationalTo: iso(l.operationalTo),
        archivedAt: iso(l.archivedAt),
      })),
    ),
    factorSets: org.factorSets.map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
      description: s.description,
      sourceUrl: s.sourceUrl,
      factors: s.factors.map(({ year, key, mainCategory, category, parameter1, parameter2, unit, scope1, scope2, scope3, outsideScopes, source, customized }) => ({
        year,
        key,
        mainCategory,
        category,
        parameter1,
        parameter2,
        unit,
        scope1,
        scope2,
        scope3,
        outsideScopes,
        source,
        customized,
      })),
    })),
    periods: org.periods.map((p) => ({
      id: p.id,
      year: p.year,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate.toISOString(),
      factorSet: !p.factorSet ? null : p.factorSet.organizationId === org.id ? { own: p.factorSet.id } : { name: p.factorSet.name, version: p.factorSet.version },
    })),
    reports: [],
    moduleData: [],
    submissions: submissions.map((s) => ({
      periodId: s.periodId,
      companyId: s.companyId,
      status: s.status,
      comment: s.comment,
      submittedAt: iso(s.submittedAt),
      submittedBy: s.submittedBy?.email ?? null,
      reviewedAt: iso(s.reviewedAt),
      reviewedBy: s.reviewedBy?.email ?? null,
    })),
    members: org.memberships.map((m) => ({ email: m.user.email, name: m.user.name, role: m.role, companyId: m.companyId, locationId: m.locationId })),
  };

  for (const r of reports) {
    const images = [];
    for (const img of r.images) images.push({ ...(await addFile(img.storageKey, img.contentType)), slot: img.slot, caption: img.caption, sort: img.sort, width: img.width, height: img.height });
    bundle.reports.push({
      id: r.id,
      periodId: r.periodId,
      name: r.name,
      standardVersion: r.standardVersion,
      module: r.module,
      basis: r.basis,
      reportingCompanyId: r.reportingCompanyId,
      omissions: r.omissions,
      consolidatedTurnover: r.consolidatedTurnover,
      status: r.status,
      content: r.content,
      companyIds: r.companies.map((c) => c.companyId),
      images,
    });
  }
  for (const md of moduleData) {
    const attachments = [];
    for (const a of md.attachments) {
      attachments.push({ ...(await addFile(a.storageKey, a.contentType)), sectionKey: a.sectionKey, filename: a.filename, size: a.size, uploadedBy: a.uploadedBy?.email ?? null });
    }
    bundle.moduleData.push({
      periodId: md.periodId,
      moduleKey: md.moduleKey,
      companyId: md.companyId,
      locationId: md.locationId,
      answers: md.answers,
      status: md.status,
      statusNote: md.statusNote,
      updatedBy: md.updatedBy?.email ?? null,
      attachments,
    });
  }

  zip.file("data.json", JSON.stringify(bundle, null, 1));
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const safe = org.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-") || "koncern";
  return { buffer, name: `${safe}-${new Date().toISOString().slice(0, 10)}.esgkoncern.zip`, summary: summarize(bundle, n) };
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export type TransferSummary = { name: string; companies: number; locations: number; years: number[]; reports: number; modules: number; files: number; members: number };

const summarize = (b: Bundle, files: number): TransferSummary => ({
  name: b.organization.name,
  companies: b.companies.length,
  locations: b.locations.length,
  years: b.periods.map((p) => p.year),
  reports: b.reports.length,
  modules: b.moduleData.length,
  files,
  members: b.members.length,
});

export class TransferError extends Error {}

/** Erstatter gamle id'er, hvor de står som tekstværdier inde i JSON (fx en valgt lokation i et modulsvar) */
function remapIds(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === "string") return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, ids));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapIds(v, ids)]));
  return value;
}

async function readBundle(data: Buffer | Uint8Array) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new TransferError("Filen er ikke en gyldig eksportfil (zip).");
  }
  const json = zip.file("data.json");
  if (!json) throw new TransferError("Filen mangler data.json – er det en eksport af en koncern?");
  let bundle: Bundle;
  try {
    bundle = JSON.parse(await json.async("string")) as Bundle;
  } catch {
    throw new TransferError("data.json kan ikke læses.");
  }
  if (bundle.format !== TRANSFER_FORMAT) throw new TransferError("Filen er ikke en eksport af en koncern.");
  if (bundle.version !== TRANSFER_VERSION) throw new TransferError(`Eksportfilen har version ${bundle.version}, men denne installation læser version ${TRANSFER_VERSION}.`);
  for (const key of ["companies", "locations", "factorSets", "periods", "reports", "moduleData", "submissions", "members"] as const) {
    if (!Array.isArray(bundle[key])) throw new TransferError(`data.json mangler "${key}".`);
  }
  return { zip, bundle };
}

/** Viser, hvad en eksportfil indeholder, uden at importere den */
export async function inspectBundle(data: Buffer | Uint8Array): Promise<TransferSummary> {
  const { zip, bundle } = await readBundle(data);
  return summarize(bundle, Object.keys(zip.files).filter((f) => f.startsWith("files/") && !zip.files[f].dir).length);
}

/**
 * Opretter koncernen fra eksportfilen som en ny koncern. Filerne gemmes først; fejler databasedelen,
 * fjernes de igen, så der ikke ligger halve importer.
 */
export async function importOrganization(data: Buffer | Uint8Array, opts: { name?: string } = {}): Promise<{ organizationId: string; summary: TransferSummary }> {
  const { zip, bundle: b } = await readBundle(data);
  const stored: string[] = [];
  const ids = new Map<string, string>();
  const newId = (old: string) => {
    const id = `c${generateToken(18).replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 24)}`;
    ids.set(old, id);
    return id;
  };
  const map = (old: string | null | undefined) => {
    if (!old) return null;
    const id = ids.get(old);
    if (!id) throw new TransferError(`Eksportfilen henviser til et ukendt id (${old}).`);
    return id;
  };

  // Id'er fastlægges på forhånd, så svarene kan oversættes, og filer kan gemmes under den nye koncern
  const orgId = newId(b.organization.id);
  for (const x of [...b.companies, ...b.locations, ...b.factorSets, ...b.periods, ...b.reports]) newId(x.id);

  const putFile = async (ref: FileRef | null) => {
    if (!ref) return null;
    const entry = zip.file(ref.file);
    if (!entry) throw new TransferError(`Eksportfilen mangler ${ref.file}.`);
    const key = `${orgId}/import-${generateToken(18).replace(/[^a-zA-Z0-9_-]/g, "")}`;
    await storage.put(key, await entry.async("nodebuffer"), ref.contentType);
    stored.push(key);
    return key;
  };

  try {
    const logoKey = await putFile(b.organization.logo);
    const coverKey = await putFile(b.organization.cover);
    const imageKeys = new Map<string, string>();
    for (const r of b.reports) for (const img of r.images) imageKeys.set(img.file, (await putFile(img))!);
    const attachmentKeys = new Map<string, string>();
    for (const md of b.moduleData) for (const a of md.attachments) attachmentKeys.set(a.file, (await putFile(a))!);

    const emails = [...new Set([...b.members.map((m) => m.email), ...b.moduleData.flatMap((m) => [m.updatedBy, ...m.attachments.map((a) => a.uploadedBy)]), ...b.submissions.flatMap((s) => [s.submittedBy, s.reviewedBy])])].filter(
      (e): e is string => !!e,
    );
    const globalSets = await db.factorSet.findMany({ where: { organizationId: null }, select: { id: true, name: true, version: true } });

    await db.$transaction(
      async (tx) => {
        // Brugere findes eller oprettes på mail (de logger ind med login-link som alle andre)
        const users = new Map<string, string>();
        for (const email of emails) {
          const name = b.members.find((m) => m.email === email)?.name ?? null;
          const u = await tx.user.upsert({ where: { email }, create: { email, name }, update: {} });
          users.set(email, u.id);
        }
        const user = (email: string | null) => (email ? (users.get(email) ?? null) : null);

        await tx.organization.create({
          data: {
            id: orgId,
            name: opts.name?.trim() || b.organization.name,
            brandColor: b.organization.brandColor,
            ...(logoKey ? { logoKey, logoContentType: b.organization.logo!.contentType, logoUpdatedAt: new Date() } : {}),
            ...(coverKey ? { coverKey, coverContentType: b.organization.cover!.contentType, coverUpdatedAt: new Date() } : {}),
          },
        });

        // Moderselskaber før datterselskaber
        const pending = [...b.companies];
        while (pending.length) {
          const i = pending.findIndex((c) => !c.parentId || !pending.some((p) => p.id === c.parentId));
          if (i < 0) throw new TransferError("Selskabsstrukturen i eksportfilen er cirkulær.");
          const [c] = pending.splice(i, 1);
          await tx.company.create({
            data: {
              id: map(c.id)!,
              organizationId: orgId,
              parentId: map(c.parentId),
              name: c.name,
              cvr: c.cvr,
              address: c.address,
              legalForm: c.legalForm as Prisma.CompanyCreateInput["legalForm"],
              naceCodes: c.naceCodes,
              consolidate: c.consolidate,
              createdAt: new Date(c.createdAt),
              archivedAt: date(c.archivedAt),
            },
          });
        }
        for (const l of b.locations) {
          await tx.location.create({
            data: {
              id: map(l.id)!,
              companyId: map(l.companyId)!,
              name: l.name,
              address: l.address,
              function: l.function,
              control: l.control as Prisma.LocationCreateInput["control"],
              latitude: l.latitude,
              longitude: l.longitude,
              operationalFrom: date(l.operationalFrom),
              operationalTo: date(l.operationalTo),
              archivedAt: date(l.archivedAt),
            },
          });
        }
        for (const s of b.factorSets) {
          await tx.factorSet.create({ data: { id: map(s.id)!, organizationId: orgId, name: s.name, version: s.version, description: s.description, sourceUrl: s.sourceUrl } });
          if (s.factors.length) await tx.emissionFactor.createMany({ data: s.factors.map((f) => ({ ...f, setId: map(s.id)! })) });
        }
        for (const p of b.periods) {
          const factorSetId = !p.factorSet ? null : "own" in p.factorSet ? map(p.factorSet.own) : (globalSets.find((g) => g.name === (p.factorSet as { name: string }).name && g.version === (p.factorSet as { version: string }).version)?.id ?? null);
          await tx.reportingPeriod.create({ data: { id: map(p.id)!, organizationId: orgId, year: p.year, startDate: new Date(p.startDate), endDate: new Date(p.endDate), factorSetId } });
        }
        for (const r of b.reports) {
          await tx.report.create({
            data: {
              id: map(r.id)!,
              periodId: map(r.periodId)!,
              name: r.name,
              standardVersion: r.standardVersion,
              module: r.module as Prisma.ReportCreateInput["module"],
              basis: r.basis as Prisma.ReportCreateInput["basis"],
              reportingCompanyId: map(r.reportingCompanyId)!,
              omissions: r.omissions,
              consolidatedTurnover: r.consolidatedTurnover,
              status: r.status as Prisma.ReportCreateInput["status"],
              content: (r.content ?? {}) as Prisma.InputJsonValue,
              companies: { create: r.companyIds.map((id) => ({ companyId: map(id)! })) },
              images: {
                create: r.images.map((img) => ({ slot: img.slot, caption: img.caption, sort: img.sort, storageKey: imageKeys.get(img.file)!, contentType: img.contentType, width: img.width, height: img.height })),
              },
            },
          });
        }
        for (const md of b.moduleData) {
          const companyId = map(md.companyId)!;
          const locationId = map(md.locationId);
          await tx.moduleData.create({
            data: {
              periodId: map(md.periodId)!,
              moduleKey: md.moduleKey,
              targetKey: locationId ? `location:${locationId}` : `company:${companyId}`,
              companyId,
              locationId,
              answers: remapIds(md.answers ?? {}, ids) as Prisma.InputJsonValue,
              status: md.status as Prisma.ModuleDataCreateInput["status"],
              statusNote: md.statusNote,
              updatedById: user(md.updatedBy),
              attachments: {
                create: md.attachments.map((a) => ({ sectionKey: a.sectionKey, filename: a.filename, contentType: a.contentType, size: a.size, storageKey: attachmentKeys.get(a.file)!, uploadedById: user(a.uploadedBy) })),
              },
            },
          });
        }
        for (const s of b.submissions) {
          await tx.companySubmission.create({
            data: {
              periodId: map(s.periodId)!,
              companyId: map(s.companyId)!,
              status: s.status as Prisma.CompanySubmissionCreateInput["status"],
              comment: s.comment,
              submittedAt: date(s.submittedAt),
              submittedById: user(s.submittedBy),
              reviewedAt: date(s.reviewedAt),
              reviewedById: user(s.reviewedBy),
            },
          });
        }
        for (const m of b.members) {
          await tx.membership.create({
            data: { userId: users.get(m.email)!, organizationId: orgId, role: m.role as Prisma.MembershipCreateInput["role"], companyId: map(m.companyId), locationId: map(m.locationId) },
          });
        }
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (e) {
    await Promise.all(stored.map((k) => storage.delete(k).catch(() => undefined)));
    throw e;
  }

  return { organizationId: orgId, summary: summarize(b, stored.length) };
}
