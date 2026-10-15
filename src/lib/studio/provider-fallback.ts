export type ModelProvider = 'api' | 'chatgpt';

export class ProviderCapacityError extends Error {
  readonly provider: ModelProvider;

  constructor(provider: ModelProvider, message: string) {
    super(message);
    this.provider = provider;
    this.name = 'ProviderCapacityError';
  }
}

export function isProviderCapacityError(error: unknown): error is ProviderCapacityError {
  return error instanceof ProviderCapacityError;
}

export async function withProviderFallback<T>(input: {
  preferred: ModelProvider;
  available: Record<ModelProvider, boolean>;
  run: (provider: ModelProvider) => Promise<T>;
}): Promise<{ value: T; provider: ModelProvider; switchedFrom?: ModelProvider }> {
  if (!input.available[input.preferred]) throw new Error('The selected model connection is not available.');
  const alternate: ModelProvider = input.preferred === 'api' ? 'chatgpt' : 'api';
  try {
    return { value: await input.run(input.preferred), provider: input.preferred };
  } catch (error) {
    if (!isProviderCapacityError(error) || !input.available[alternate]) throw error;
    return { value: await input.run(alternate), provider: alternate, switchedFrom: input.preferred };
  }
}
