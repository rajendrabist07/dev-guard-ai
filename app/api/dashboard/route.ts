import { NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/db/supabase';

export async function GET() {
  try {
    const data = await getDashboardData();
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('Error loading dashboard data:', err);
    const message = err instanceof Error ? err.message : 'Dashboard data could not be loaded.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
