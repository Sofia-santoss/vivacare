import { parseIpRateLimitConfig } from '../auth/ipRateLimit.js';

export const APPROVED_PUBLIC_SUBMISSION_RATE_LIMIT = Object.freeze({
  maxRequests: 60,
  windowSeconds: 60,
});

export function parsePublicSubmissionRateLimit(limitValue: string | undefined, windowValue: string | undefined) {
  const limit = limitValue?.trim() || String(APPROVED_PUBLIC_SUBMISSION_RATE_LIMIT.maxRequests);
  const window = windowValue?.trim() || String(APPROVED_PUBLIC_SUBMISSION_RATE_LIMIT.windowSeconds);
  return parseIpRateLimitConfig(limit, window, {
    limit: 'PUBLIC_SURVEY_IP_LIMIT',
    window: 'PUBLIC_SURVEY_IP_WINDOW_SECONDS',
  });
}
