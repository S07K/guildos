export type ProviderId = 'openai' | (string & {});

export type AuthorizationStart = {
  authorizationUrl: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
};

export type ProviderIdentity = {
  subject: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

export type ProviderTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string;
  tokenType: string;
  expiresIn: number;
  scopes: string[];
  identity: ProviderIdentity;
};

export type OAuthProvider = {
  id: ProviderId;
  displayName: string;
  configured(): boolean;
  begin(input: { redirectUri: string; state: string; nonce: string; codeChallenge: string }): URL;
  exchange(input: { code: string; redirectUri: string; codeVerifier: string; nonce: string }): Promise<ProviderTokenSet>;
  refresh?(input: { refreshToken: string; expectedSubject: string }): Promise<ProviderTokenSet>;
};

export type ConnectionStatus = {
  provider: ProviderId;
  connected: boolean;
  identity?: ProviderIdentity;
  scopes?: string[];
  expiresAt?: string;
};
