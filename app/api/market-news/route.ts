import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Never hardcode third-party secrets in source. Fail closed if unset.
    const marketauxApiToken = process.env.MARKETAUX_API_TOKEN?.trim() ?? '';
    if (!marketauxApiToken) {
      return NextResponse.json(
        { error: 'Market news is not configured.' },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '3';
    const page = searchParams.get('page') || '1';
    const search = searchParams.get('search');

    const queryParams = new URLSearchParams({
      api_token: marketauxApiToken,
      language: "en",
      limit,
      page
    });

    if (search) {
      queryParams.append("search", search);
    }

    const apiUrl = `https://api.marketaux.com/v1/news/all?${queryParams.toString()}`;

    // Cache the response for 600 seconds (10 minutes)
    const res = await fetch(apiUrl, {
      next: { revalidate: 600 }
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Marketaux API error: ${res.status} ${errorText}`);
      return NextResponse.json(
        { error: 'Failed to fetch from upstream API' },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    // Add cache headers so standard browsers also obey client-side caching if they call it again
    const response = NextResponse.json(data);
    response.headers.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
    
    return response;
  } catch (error) {
    console.error("Error connecting to Marketaux API:", error);
    return NextResponse.json(
      { error: 'Internal server error while fetching news' },
      { status: 500 }
    );
  }
}
