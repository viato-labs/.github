import { NextResponse } from "next/server";
import { researchCompanyContext } from "@/lib/research/context";
import { getCompany } from "@/lib/workspaces/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    companyId?: string;
    query?: string;
  };

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const company = await getCompany(body.companyId);
    const research = await researchCompanyContext(company.id, query);
    return NextResponse.json({
      company: { id: company.id, name: company.name },
      research,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Research failed",
      },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") || undefined;
  const company = await getCompany(companyId);
  return NextResponse.json({
    company: { id: company.id, name: company.name },
    historicalTickets: company.memory.historicalTickets.slice(0, 20),
    confluencePages: (company.memory.confluencePages || []).slice(0, 20),
    recentQueries: (company.memory.researchQueries || []).slice(0, 10),
    houseStyleNotes: company.memory.houseStyleNotes.slice(0, 10),
  });
}
