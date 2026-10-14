// Never include provider messages: they may contain addresses or credentials.
export function codeDeliveryError(error) {
 const code = typeof error?.code === 'string' && /^[a-z_]{1,80}$/.test(error.code) ? error.code : 'unknown';
 const status = Number.isInteger(error?.status) ? error.status : null;
 let message = 'We could not send a code. Please try again later.';
 if (status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(code)) {
  message = 'Too many sign-in requests. Please wait a few minutes before requesting another code.';
 } else if (code === 'email_address_not_authorized') {
  message = 'Email delivery is not configured for this address. Please contact the site owner.';
 } else if (['email_provider_disabled', 'otp_disabled', 'signup_disabled'].includes(code)) {
  message = 'Email sign-in is currently unavailable. Please contact the site owner.';
 } else if (code === 'email_address_invalid') {
  message = 'Please use a valid email address that can receive mail.';
 }
 return { code, status, message };
}
