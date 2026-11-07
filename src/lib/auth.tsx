import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';
import { deleteAllPhotos } from './sync/supabaseRemote';

WebBrowser.maybeCompleteAuthSession();

export type Provider = 'google' | 'apple';

type AuthCtx = {
  session: Session | null;
  ready: boolean;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInWith: (provider: Provider) => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

/** Where OAuth providers send the user back: wearday://auth-callback (or the web page). */
export const redirectUrl = () =>
  Platform.OS === 'web' ? `${globalThis.location?.origin ?? ''}/account` : Linking.createURL('auth-callback');

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

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      ready,
      async sendCode(email) {
        const { error } = await need().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
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
    [session, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
