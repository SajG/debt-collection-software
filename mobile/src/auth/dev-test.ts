// Dev-only phone OTP shortcut. Production bundles never see these env
// vars (they are not set in EAS), and every helper also gates on __DEV__.

export const DEV_TEST_EMAIL = process.env.EXPO_PUBLIC_DEV_TEST_EMAIL;
export const DEV_TEST_PASSWORD = process.env.EXPO_PUBLIC_DEV_TEST_PASSWORD;
export const DEV_TEST_PHONE = process.env.EXPO_PUBLIC_DEV_TEST_PHONE;
export const DEV_TEST_OTP = process.env.EXPO_PUBLIC_DEV_TEST_OTP;

export function isDevPasswordLoginEnabled(): boolean {
  return __DEV__ && !!DEV_TEST_EMAIL && !!DEV_TEST_PASSWORD;
}

export function isDevTestOtpEnabled(): boolean {
  return (
    isDevPasswordLoginEnabled() && !!DEV_TEST_PHONE && !!DEV_TEST_OTP
  );
}

export function isDevTestPhone(digits: string): boolean {
  return isDevTestOtpEnabled() && digits === DEV_TEST_PHONE;
}

export function isDevTestOtp(digits: string, code: string): boolean {
  return isDevTestPhone(digits) && code === DEV_TEST_OTP;
}
