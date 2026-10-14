import test from 'node:test';
import assert from 'node:assert/strict';
import { codeDeliveryError } from '../src/lib/studio/auth-errors.mjs';

test('code delivery errors distinguish throttling without exposing provider messages', () => {
 const result = codeDeliveryError({ code: 'over_email_send_rate_limit', status: 429, message: 'private@example.com secret' });
 assert.match(result.message, /Too many sign-in requests/);
 assert.doesNotMatch(JSON.stringify(result), /private@example.com|secret/);
 assert.match(codeDeliveryError({ code: 'email_address_not_authorized' }).message, /not configured/);
 assert.match(codeDeliveryError({ code: 'otp_disabled' }).message, /unavailable/);
 assert.equal(codeDeliveryError({ code: 'private@example.com', message: 'secret' }).code, 'unknown');
 assert.equal(codeDeliveryError(null).code, 'unknown');
});
