import { NextResponse } from "next/server";
import { clearCompanyOAuth, getCompany } from "@/lib/workspaces/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { companyId?: string };
  try {
    const company = await getCompany(body.companyId);
    const summary = await clearCompanyOAuth(company.id);
    return NextResponse.json({
      company: summary,
      message: `Signed out of Jira for ${summary.name}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Logout failed" },
      { status: 400 },
    );
  }
}
