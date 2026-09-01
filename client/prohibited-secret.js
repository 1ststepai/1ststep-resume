const SECRET_LABEL = String.raw`(?:password|passcode|otp|one[- ]time(?: password| code)?|captcha(?: answer)?|mfa(?: code)?|security code|verification code|api[_ -]?key|auth[_ -]?token|access[_ -]?token|refresh[_ -]?token|(?:session )?cookie|secret)`;
const SECRET_SEPARATOR = String.raw`(?:\s*[:=]\s*|\s+(?:is|was)\s+)`;

export const PROHIBITED_CREDENTIAL_KEY = /(?:password|passcode|credential|secret|otp|oneTime|captcha|mfa|securityCode|verificationCode|accessToken|refreshToken|cookie|sessionCookie|apiKey|authToken)/i;
export const PROHIBITED_SECRET_VALUE = new RegExp(String.raw`\b${SECRET_LABEL}${SECRET_SEPARATOR}\S+`, 'i');
const PROHIBITED_SECRET_LINE = new RegExp(String.raw`\b${SECRET_LABEL}${SECRET_SEPARATOR}[^\r\n]{1,512}`, 'gi');

export function containsProhibitedSecretText(value) {
  return PROHIBITED_SECRET_VALUE.test(String(value || ''));
}

export function redactProhibitedSecretText(value, replacement = '[secret omitted]') {
  return String(value || '').replace(PROHIBITED_SECRET_LINE, replacement);
}

export function assertNoProhibitedSecretText(value, message = 'Credentials and challenge answers are not allowed.') {
  if (containsProhibitedSecretText(value)) throw new Error(message);
}
