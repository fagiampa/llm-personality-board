import { NextRequest, NextResponse } from "next/server";
import { getProbeForAssessment } from "@/lib/db.mjs";

export const dynamic = "force-dynamic";

// A model can have a declared profile (assessments) with no enacted one
// (probe_runs) yet — 404 is the expected, non-error response in that case,
// not a sign something's broken. See lib/db.mjs's getProbeForAssessment for
// how assessedAt (the questionnaire run) is joined to a probe run (which
// runs on its own schedule) via model_version.
export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get("model");
  if (!model) {
    return NextResponse.json({ error: "missing 'model' query param" }, { status: 400 });
  }
  const assessedAt = request.nextUrl.searchParams.get("assessedAt") || null;

  const probe = await getProbeForAssessment(model, assessedAt);
  if (!probe) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(probe);
}
