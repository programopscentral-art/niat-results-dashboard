'use client';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const signIn = async () => {
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
        // Both nxtwave.in and nxtwave.co.in are used — don't lock to one domain.
        queryParams: { prompt: 'select_account' },
      },
    });
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="m">◈</div>
        <h1>NIAT Records</h1>
        <p>Sign in with your NxtWave account to view collaborated-college student records.</p>
        <button className="gbtn" onClick={signIn}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7C43.9 37.9 46.5 31.8 46.5 24.5z"/>
            <path fill="#FBBC05" d="M10.4 28.3c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.9-6.1C.9 15.7 0 19.7 0 23.5s.9 7.8 2.5 10.9l7.9-6.1z"/>
            <path fill="#34A853" d="M24 47c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.9 6.1C6.4 42.6 14.6 47 24 47z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
