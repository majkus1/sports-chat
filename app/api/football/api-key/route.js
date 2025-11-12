import { NextResponse } from 'next/server';

export async function GET() {
  // Return API key from environment variable
  // This endpoint should only be accessible from same origin
  const apiKey = process.env.API_SPORTS_KEY || '';
  
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }
  
  return NextResponse.json({ key: apiKey });
}

