import { NextRequest, NextResponse } from "next/server";
import { listVersions } from "@/lib/db.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get("model");
  if (!model) {
    return NextResponse.json({ error: "missing 'model' query param" }, { status: 400 });
  }
  const versions = await listVersions(model);
  return NextResponse.json(versions);
}
