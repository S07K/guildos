export type ModelProvider = 'api' | 'chatgpt' | 'anthropic' | 'openrouter' | 'groq';

export const providerPriority: readonly ModelProvider[] = ['chatgpt', 'anthropic', 'groq', 'openrouter', 'api'];
export function preferredProvider(available: Partial<Record<ModelProvider, boolean>>): ModelProvider {
 return providerPriority.find(provider => available[provider]) || 'api';
}

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
  const order: ModelProvider[] = [input.preferred,...providerPriority.filter(item=>item!==input.preferred)];
  let previousError:unknown;
  for(const provider of order) {
   if(!input.available[provider]) continue;
   try {return {value:await input.run(provider),provider,...(provider!==input.preferred?{switchedFrom:input.preferred}:{})};}
   catch(error) {previousError=error;if(!isProviderCapacityError(error)) throw error;}
  }
  throw previousError;
}
