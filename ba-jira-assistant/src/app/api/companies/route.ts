import { NextResponse } from "next/server";
import {
  createCompany,
  getActiveCompanyId,
  listCompanies,
  setActiveCompany,
} from "@/lib/workspaces/store";

export async function GET() {
  const companies = await listCompanies();
  const activeCompanyId = await getActiveCompanyId();
  return NextResponse.json({ activeCompanyId, companies });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    activate?: boolean;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const company = await createCompany(body.name.trim(), body.slug);
    if (body.activate) await setActiveCompany(company.id);
    const companies = await listCompanies();
    return NextResponse.json({
      company,
      activeCompanyId: await getActiveCompanyId(),
      companies,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { activeCompanyId?: string };
  if (!body.activeCompanyId) {
    return NextResponse.json(
      { error: "activeCompanyId is required" },
      { status: 400 },
    );
  }
  try {
    await setActiveCompany(body.activeCompanyId);
    return NextResponse.json({
      activeCompanyId: await getActiveCompanyId(),
      companies: await listCompanies(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Switch failed" },
      { status: 400 },
    );
  }
}
