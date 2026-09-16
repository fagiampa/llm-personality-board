import { NextResponse } from "next/server";
import { listLatestPerModel } from "@/lib/db.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const models = await listLatestPerModel();
  return NextResponse.json(models);
}
