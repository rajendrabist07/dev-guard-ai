import { NextRequest, NextResponse } from 'next/server';
import { buildOpenApiDocument } from '@/lib/docs/openapi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const spec = buildOpenApiDocument(origin);
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=60',
    },
  });
}
