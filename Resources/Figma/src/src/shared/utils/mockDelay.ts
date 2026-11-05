/** Simulated latency for mock services. Replace with real API calls later. */
export function mockDelay<T>(value: T, ms = 700): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}