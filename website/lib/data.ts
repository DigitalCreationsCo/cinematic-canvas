"use server";

export interface VideoExample {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
}

export async function fetchVideos(limit = 20): Promise<VideoExample[]> {
  try {
    const response = await fetch(`/api/videos?limit=${limit}&minDuration=12`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-api-key': process.env.INTERNAL_API_KEY || 'internal-api-key'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch videos');
    }

    const result = await response.json();
    console.log(`Found ${result.count} completed videos:`, result.data);

    return result.data;
  } catch (err: any) {
    console.error('Request failed:', err.message);
    return [];
  }
}
