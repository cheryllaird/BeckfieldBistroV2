export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/unauthorized-domain':
      return `Sign-in is blocked: "${window.location.hostname}" isn't in Firebase's authorized domains. Go to Firebase Console → Authentication → Settings → Authorized domains and add this hostname.`;
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this project. Please contact support.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please wait a moment and try again.';
    default:
      return code
        ? `Sign-in failed (${code}). Please try again.`
        : 'Sign-in failed. Please try again.';
  }
}
