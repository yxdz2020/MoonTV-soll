/* eslint-disable no-console */

import { NextRequest, NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  console.log('custom_category', req.url);
  const config = await getConfig();
  return NextResponse.json(config.CustomCategories);
}