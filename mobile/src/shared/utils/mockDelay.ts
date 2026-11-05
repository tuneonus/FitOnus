export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const mockDelay = async <T>(result: T, ms: number = 300): Promise<T> => {
  await delay(ms);
  return result;
};
