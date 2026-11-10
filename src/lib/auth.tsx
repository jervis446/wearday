import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { logError } from './diagnostics';
import { supabase } from './supabase';
import { deleteAllPhotos } from './sync/supabaseRemote';

WebBrowser.maybeCompleteAuthSession();

export type Provider = 'google' | 'apple';

type AuthCtx = {
  session: Session | null;
  ready: boolean;
  /** Set if checking for an existing sign-in failed (the sign-in screen still works). */
  initError: string | null;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInWith: (provider: Provider) => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

/** Where OAuth providers send the user back: wearday://auth-callback (or the web page). */
export const redirectUrl = () =>
  Platform.OS === 'web' ? `${globalThis.location?.origin ?? ''}/welcome` : Linking.createURL('auth-callback');

const need = () => {
  if (!supabase) throw new Error('Accounts aren’t set up in this build.');
  return supabase;
};

/** Turns Supabase error messages into something a person can act on. */
function friendly(e: { message?: string } | null | undefined): Error {
  const m = e?.message ?? 'Something went wrong';
  if (/expired|invalid/i.test(m) && /token|otp|code/i.test(m)) return new Error('That code is wrong or has expired. Request a new one.');
  if (/rate limit|too many/i.test(m)) return new Error('Too many attempts. Wait a minute and try again.');
  if (/network|fetch/i.test(m)) return new Error('No connection. Check your internet and try again.');
  return new Error(m);
}

/** Finishes an OAuth sign-in from the redirect URL (code flow). */
export async function completeOAuthFromUrl(url: string): Promise<boolean> {
  const client = need();
  const parsed = Linking.parse(url);
  const params = { ...(parsed.queryParams ?? {}) } as Record<string, string>;
  // Some providers put errors in the #fragment.
  const hash = url.split('#')[1];
  if (hash) for (const [k, v] of new URLSearchParams(hash)) params[k] = v;
  if (params.error || params.error_description) throw new Error(params.error_description || params.error);
  if (!params.code) return false;
  const { error } = await client.auth.exchangeCodeForSession(params.code);
  if (error) throw friendly(error);
  return true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let done = false;
    // Never leave the app waiting: if the stored-session check fails or hangs, carry on signed out.
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      setInitError('Checking your sign-in took too long. You can still sign in.');
      logError('auth init', new Error('getSession timed out after 6s'));
      setReady(true);
    }, 6000);
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        setSession(data.session);
      })
      .catch((e) => {
        logError('auth init', e);
        setInitError((e as Error)?.message ?? 'Could not check your sign-in.');
      })
      .finally(() => {
        done = true;
        clearTimeout(timer);
        setReady(true);
      });
    let unsubscribe = () => {};
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
      unsubscribe = () => data.subscription.unsubscribe();
    } catch (e) {
      logError('auth listener', e);
    }
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      ready,
      initError,
      async sendCode(email) {
        // The email carries a sign-in link (opens the app via redirectUrl) and, if the template includes it, a 6-digit code.
        const { error } = await need().auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true, emailRedirectTo: redirectUrl() },
        });
        if (error) throw friendly(error);
      },
      async verifyCode(email, code) {
        const { error } = await need().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
        if (error) throw friendly(error);
      },
      async signInWith(provider) {
        const client = need();
        // iPhone: native Sign in with Apple sheet.
        if (provider === 'apple' && Platform.OS === 'ios') {
          const cred = await AppleAuthentication.signInAsync({
            requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
          }).catch((e) => {
            if (e?.code === 'ERR_REQUEST_CANCELED') return null;
            throw e;
          });
          if (!cred) return false;
          if (!cred.identityToken) throw new Error('Apple didn’t return a sign-in token. Try again.');
          const { error } = await client.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
          if (error) throw friendly(error);
          return true;
        }
        const redirectTo = redirectUrl();
        if (Platform.OS === 'web') {
          const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
          if (error) throw friendly(error);
          return false; // the page navigates away
        }
        const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
        if (error || !data?.url) throw friendly(error);
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type !== 'success') return false;
        return completeOAuthFromUrl(res.url);
      },
      async signOut() {
        await need().auth.signOut();
      },
      async deleteAccount() {
        const client = need();
        const uid = session?.user.id;
        if (!uid) throw new Error('Not signed in.');
        await deleteAllPhotos(client, uid);
        const { error } = await client.rpc('delete_my_account');
        if (error) throw friendly(error);
        await client.auth.signOut();
      },
    }),
    [session, ready, initError],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
