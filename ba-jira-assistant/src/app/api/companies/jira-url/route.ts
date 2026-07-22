import { NextResponse } from "next/server";
import {
  getCompany,
  getCompanySecrets,
  saveCompanySecrets,
} from "@/lib/workspaces/store";

/** Save the company Jira site URL the BA will log into. */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    companyId?: string;
    jiraUrl?: string;
  };
  if (!body.companyId || !body.jiraUrl?.trim()) {
    return NextResponse.json(
      { error: "companyId and jiraUrl are required" },
      { status: 400 },
    );
  }

  try {
    const url = new URL(body.jiraUrl.trim());
    const jiraUrl = `${url.protocol}//${url.host}`;
    const company = await getCompany(body.companyId);
    const existing = await getCompanySecrets(company.id);
    const updated = await saveCompanySecrets(company.id, {
      baseUrl: jiraUrl,
      email: existing?.email || "browser-session@local",
      apiToken: existing?.apiToken || "browser-session",
      dryRun: existing?.dryRun ?? true,
    });
    return NextResponse.json({
      company: {
        id: updated.id,
        name: updated.name,
        jiraUrl: updated.connection.baseUrl,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save Jira URL",
      },
      { status: 400 },
    );
  }
}
