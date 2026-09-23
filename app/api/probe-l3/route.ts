import { NextRequest, NextResponse } from "next/server";
import { getL3ProbeForAssessment } from "@/lib/db.mjs";

export const dynamic = "force-dynamic";

// Same shape as GET /api/probe (L2): a model can have a declared profile
// with no L3 run yet, so 404 is the expected "no data" response, not a
// sign something's broken. See lib/db.mjs's getL3ProbeForAssessment.
export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get("model");
  if (!model) {
    return NextResponse.json({ error: "missing 'model' query param" }, { status: 400 });
  }
  const assessedAt = request.nextUrl.searchParams.get("assessedAt") || null;

  const probe = await getL3ProbeForAssessment(model, assessedAt);
  if (!probe) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(probe);
}
