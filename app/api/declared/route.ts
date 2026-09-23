import { NextRequest, NextResponse } from "next/server";
import { getDeclaredAnchoredForAssessment } from "@/lib/db.mjs";

export const dynamic = "force-dynamic";

// Same shape as GET /api/probe and /api/probe-l3: a model can have a
// generic profile with no anchored run yet, so 404 is the expected
// "no data" response, not a sign something's broken. See lib/db.mjs's
// getDeclaredAnchoredForAssessment.
export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get("model");
  if (!model) {
    return NextResponse.json({ error: "missing 'model' query param" }, { status: 400 });
  }
  const assessedAt = request.nextUrl.searchParams.get("assessedAt") || null;

  const anchored = await getDeclaredAnchoredForAssessment(model, assessedAt);
  if (!anchored) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(anchored);
}
