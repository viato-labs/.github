import { NextResponse } from "next/server";
import { secretsFromBody } from "@/lib/jira/client";
import { getCompany, saveCompanySecrets } from "@/lib/workspaces/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    companyId?: string;
    baseUrl?: string;
    email?: string;
    apiToken?: string;
    dryRun?: boolean;
  };

  if (!body.companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  if (!body.baseUrl || !body.email || !body.apiToken) {
    return NextResponse.json(
      { error: "baseUrl, email, and apiToken are required" },
      { status: 400 },
    );
  }

  try {
    await getCompany(body.companyId);
    const company = await saveCompanySecrets(
      body.companyId,
      secretsFromBody({
        baseUrl: body.baseUrl,
        email: body.email,
        apiToken: body.apiToken,
        dryRun: body.dryRun ?? true,
      }),
    );
    return NextResponse.json({
      company,
      note: "Token stored only in local .data/workspaces/<slug>/secrets.json (gitignored).",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed" },
      { status: 400 },
    );
  }
}
