import { NextRequest, NextResponse } from "next/server";
import { getAssessment } from "@/lib/db.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get("model");
  if (!model) {
    return NextResponse.json({ error: "missing 'model' query param" }, { status: 400 });
  }
  // Absent/empty assessedAt means the seed entry (no real timestamp).
  const assessedAt = request.nextUrl.searchParams.get("assessedAt") || null;

  const assessment = await getAssessment(model, assessedAt);
  if (!assessment) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(assessment);
}
