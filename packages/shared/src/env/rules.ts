const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);
const PLACEHOLDER = 'CHANGE_ME';

export function safeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host.toLowerCase());
}

export interface ProductionRuleInput {
  NODE_ENV: string;
  ALLOW_INSECURE_LOCAL?: boolean | undefined;
  DATABASE_URL?: string | undefined;
  REDIS_URL?: string | undefined;
  APP_URL?: string | undefined;
}

export type RuleIssue = { path: string; message: string };

/**
 * Extra checks that only apply when NODE_ENV=production. Messages never echo values.
 */
export function productionIssues(env: ProductionRuleInput): RuleIssue[] {
  if (env.NODE_ENV !== 'production') return [];

  // Local production-mode runs (for example `next start` against Docker Compose) cannot use TLS.
  // The opt-out is honoured ONLY when every configured URL points at this machine.
  if (env.ALLOW_INSECURE_LOCAL) {
    const urls: Array<[string, string | undefined]> = [
      ['DATABASE_URL', env.DATABASE_URL],
      ['REDIS_URL', env.REDIS_URL],
      ['APP_URL', env.APP_URL],
    ];
    return urls
      .filter(([, value]) => value !== undefined && !isLocalHost(safeUrl(value)?.hostname ?? ''))
      .map(([path]) => ({
        path,
        message: 'ALLOW_INSECURE_LOCAL=true is only permitted when every URL points to localhost',
      }));
  }

  const issues: RuleIssue[] = [];

  if (env.DATABASE_URL !== undefined) {
    const url = safeUrl(env.DATABASE_URL);
    const sslmode = url?.searchParams.get('sslmode') ?? '';
    if (!SSL_MODES.has(sslmode)) {
      issues.push({
        path: 'DATABASE_URL',
        message: 'must set sslmode=require (or verify-ca / verify-full) in production',
      });
    }
    if (env.DATABASE_URL.includes(PLACEHOLDER)) {
      issues.push({ path: 'DATABASE_URL', message: 'still contains a CHANGE_ME placeholder' });
    }
  }

  if (env.REDIS_URL !== undefined) {
    const url = safeUrl(env.REDIS_URL);
    if (url) {
      if (url.password === '') {
        issues.push({ path: 'REDIS_URL', message: 'must include a password in production' });
      }
      if (!isLocalHost(url.hostname) && url.protocol !== 'rediss:') {
        issues.push({
          path: 'REDIS_URL',
          message: 'must use rediss:// (TLS) for non-local hosts in production',
        });
      }
    }
    if (env.REDIS_URL.includes(PLACEHOLDER)) {
      issues.push({ path: 'REDIS_URL', message: 'still contains a CHANGE_ME placeholder' });
    }
  }

  if (env.APP_URL !== undefined) {
    const url = safeUrl(env.APP_URL);
    if (url && url.protocol !== 'https:') {
      issues.push({ path: 'APP_URL', message: 'must use https:// in production' });
    }
  }

  return issues;
}
