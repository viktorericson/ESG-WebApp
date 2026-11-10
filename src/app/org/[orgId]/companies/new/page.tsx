import Link from "next/link";
import { CompanyForm } from "@/components/company-form";
import { Card, PageHeader } from "@/components/ui";
import { createCompany } from "@/lib/actions/org";
import { deny, requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Nyt selskab" };

export default async function NewCompanyPage({ params, searchParams }: PageProps<"/org/[orgId]/companies/new">) {
  const { orgId } = await params;
  const { parent } = await searchParams;
  const { access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) deny();
  const companies = await db.company.findMany({ where: { organizationId: orgId, archivedAt: null }, orderBy: { name: "asc" } });
  const root = companies.find((c) => !c.parentId);

  return (
    <>
      <Link href={`/org/${orgId}`} className="text-sm text-neutral-500 hover:text-neutral-800">← Overblik</Link>
      <PageHeader title="Tilføj selskab" description="Datterselskaber indrapporterer selv og samles i koncernens opgørelse." />
      <Card className="max-w-3xl">
        <CompanyForm
          action={createCompany}
          orgId={orgId}
          parentOptions={companies}
          canEditStructure
          submitLabel="Opret selskab"
          company={{
            id: "",
            name: "",
            cvr: "",
            address: null,
            legalForm: null,
            naceCodes: [],
            parentId: typeof parent === "string" ? parent : (root?.id ?? null),
            consolidate: true,
          }}
        />
      </Card>
    </>
  );
}
