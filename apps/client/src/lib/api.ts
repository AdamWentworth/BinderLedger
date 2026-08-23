export type Health = {
  status: 'ok' | 'degraded';
  database: 'ok' | 'unavailable';
};

export const apiURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch(`${apiURL}/api/health`, { signal });
  if (!response.ok) {
    throw new Error(`BinderLedger API returned ${response.status}`);
  }
  return response.json() as Promise<Health>;
}
