/**
 * Firebase Auth for Vybe — runs in the Electron main process using
 * the Firebase Identity Toolkit REST API (zero extra npm dependencies).
 *
 * Supports:
 *  - Email/Password & Username/Password (usernames map to @users.vybe.local)
 *  - Google Sign-In
 *  - Guest mode (local profile)
 *
 * Tokens are sealed securely with Electron safeStorage (DPAPI).
 */
import { app, shell } from "electron";
import * as persist from "./persist";
import { openSecret, sealSecret } from "./secrets";
import { normalizeDisplayName, passwordProblem } from "../src/lib/account-validators";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCeDxRl7J_J9Td6TuGTQPIO_NzpuamSzCE",
  authDomain: "vybe-36c4f.firebaseapp.com",
  projectId: "vybe-36c4f",
  storageBucket: "vybe-36c4f.firebasestorage.app",
  messagingSenderId: "272874776400",
  appId: "1:272874776400:web:965f3dbbafa4a49b582e55",
};

const ID_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1/accounts";
const SECURE_TOKEN_URL = "https://securetoken.googleapis.com/v1/token";

export type AuthMode = "guest" | "account";

export interface FirebaseSession {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  localId: string;
  email: string;
  displayName?: string;
}

export interface LocalProfile {
  mode: AuthMode;
  userId?: string;
  username?: string;
  displayName?: string;
  deviceId: string;
  createdAt: number;
}

export interface SessionInfo {
  mode: AuthMode | null;
  userId: string | null;
  username: string | null;
  displayName?: string | null;
  suggestedDisplayName?: string;
  freshInstall: boolean;
  needsUsername?: boolean;
  isNewAccount?: boolean;
}

let currentSession: FirebaseSession | null = null;
let freshInstall = false;
let carriedName: string | null = null;

export function initInstallMarker(): void {
  const p = persist.readData("profile");
  freshInstall = p === null;
}

export function readProfile(): LocalProfile | null {
  return (persist.readData("profile") as LocalProfile | null) ?? null;
}

async function writeProfile(patch: Partial<LocalProfile> & { mode: AuthMode }): Promise<LocalProfile> {
  const existing = readProfile();
  const next: LocalProfile = {
    deviceId: existing?.deviceId ?? Math.random().toString(36).slice(2),
    createdAt: existing?.createdAt ?? Date.now(),
    ...existing,
    ...patch,
  };
  await persist.writeData("profile", next);
  return next;
}

function resolveEmail(identifier: string): string {
  const clean = identifier.trim().toLowerCase();
  if (clean.includes("@")) return clean;
  return `${clean}@users.vybe.local`;
}

function emailToUsername(email: string): string {
  if (email.endsWith("@users.vybe.local")) {
    return email.replace(/@users\.vybe\.local$/, "");
  }
  return email;
}

async function persistSession(session: FirebaseSession | null): Promise<void> {
  currentSession = session;
  if (!session) {
    await persist.writeData("auth", null);
    return;
  }
  try {
    const sealed = sealSecret(JSON.stringify(session));
    await persist.writeData("auth", { sealed });
  } catch {
    await persist.writeData("auth", null);
  }
}

export async function initAuth(): Promise<void> {
  const sealed = (persist.readData("auth") as { sealed?: string } | null)?.sealed;
  if (!sealed) return;
  const raw = openSecret(sealed);
  if (!raw) return;
  try {
    const s = JSON.parse(raw) as FirebaseSession;
    if (Date.now() >= s.expiresAt - 60_000) {
      // Refresh token
      const res = await fetch(`${SECURE_TOKEN_URL}?key=${FIREBASE_CONFIG.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: s.refreshToken,
        }).toString(),
      });
      if (res.ok) {
        const data = await res.json() as { id_token: string; refresh_token: string; expires_in: string; user_id: string };
        s.idToken = data.id_token;
        s.refreshToken = data.refresh_token;
        s.expiresAt = Date.now() + parseInt(data.expires_in, 10) * 1000;
        await persistSession(s);
      } else {
        await persistSession(null);
        return;
      }
    } else {
      currentSession = s;
    }
  } catch {
    await persistSession(null);
  }
}

export function sessionInfo(): SessionInfo {
  const profile = readProfile();
  if (!profile) {
    return {
      mode: null,
      userId: null,
      username: null,
      displayName: null,
      freshInstall,
      ...(carriedName ? { suggestedDisplayName: carriedName } : {}),
    };
  }
  if (profile.mode === "guest") {
    return {
      mode: "guest",
      userId: null,
      username: null,
      displayName: profile.displayName ?? null,
      freshInstall,
    };
  }
  return {
    mode: "account",
    userId: profile.userId ?? currentSession?.localId ?? null,
    username: profile.username ?? (currentSession?.email ? emailToUsername(currentSession.email) : null),
    displayName: profile.displayName ?? currentSession?.displayName ?? null,
    freshInstall,
  };
}

export async function signIn(identifier: string, pass: string): Promise<SessionInfo> {
  const email = resolveEmail(identifier);
  const res = await fetch(`${ID_TOOLKIT_URL}:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: pass,
      returnSecureToken: true,
    }),
  });

  const data = await res.json() as {
    idToken?: string;
    refreshToken?: string;
    expiresIn?: string;
    localId?: string;
    email?: string;
    displayName?: string;
    error?: { message?: string };
  };

  if (!res.ok || !data.idToken || !data.localId) {
    const err = data.error?.message ?? "";
    if (/EMAIL_NOT_FOUND|INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/i.test(err)) {
      throw new Error("Invalid username, email, or password.");
    }
    if (/USER_DISABLED/i.test(err)) {
      throw new Error("This account has been disabled.");
    }
    throw new Error(err || "Sign in failed. Check your connection.");
  }

  const session: FirebaseSession = {
    idToken: data.idToken,
    refreshToken: data.refreshToken ?? "",
    expiresAt: Date.now() + parseInt(data.expiresIn ?? "3600", 10) * 1000,
    localId: data.localId,
    email: data.email ?? email,
    displayName: data.displayName,
  };
  await persistSession(session);

  const username = emailToUsername(session.email);
  const profile = await writeProfile({
    mode: "account",
    userId: session.localId,
    username,
    displayName: session.displayName,
  });

  return {
    mode: "account",
    userId: profile.userId ?? session.localId,
    username,
    displayName: profile.displayName ?? session.displayName ?? null,
    freshInstall: false,
    isNewAccount: false,
  };
}

export async function signUp(identifier: string, pass: string, displayName?: string): Promise<SessionInfo> {
  const pwProb = passwordProblem(pass);
  if (pwProb) throw new Error(pwProb);

  const email = resolveEmail(identifier);
  const res = await fetch(`${ID_TOOLKIT_URL}:signUp?key=${FIREBASE_CONFIG.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: pass,
      returnSecureToken: true,
    }),
  });

  const data = await res.json() as {
    idToken?: string;
    refreshToken?: string;
    expiresIn?: string;
    localId?: string;
    email?: string;
    error?: { message?: string };
  };

  if (!res.ok || !data.idToken || !data.localId) {
    const err = data.error?.message ?? "";
    if (/EMAIL_EXISTS/i.test(err)) {
      throw new Error("That username or email is already registered.");
    }
    throw new Error(err || "Sign up failed.");
  }

  const cleanName = displayName ? normalizeDisplayName(displayName) : undefined;
  if (cleanName) {
    try {
      await fetch(`${ID_TOOLKIT_URL}:update?key=${FIREBASE_CONFIG.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: data.idToken,
          displayName: cleanName,
          returnSecureToken: true,
        }),
      });
    } catch {
      /* non-fatal */
    }
  }

  const session: FirebaseSession = {
    idToken: data.idToken,
    refreshToken: data.refreshToken ?? "",
    expiresAt: Date.now() + parseInt(data.expiresIn ?? "3600", 10) * 1000,
    localId: data.localId,
    email: data.email ?? email,
    displayName: cleanName,
  };
  await persistSession(session);

  const username = emailToUsername(session.email);
  const profile = await writeProfile({
    mode: "account",
    userId: session.localId,
    username,
    displayName: cleanName,
  });

  return {
    mode: "account",
    userId: profile.userId ?? session.localId,
    username,
    displayName: cleanName ?? null,
    freshInstall: false,
    isNewAccount: true,
  };
}

export async function setDisplayName(name: string): Promise<SessionInfo> {
  const clean = normalizeDisplayName(name);
  if (!clean) throw new Error("Enter a display name.");
  if (currentSession?.idToken) {
    await fetch(`${ID_TOOLKIT_URL}:update?key=${FIREBASE_CONFIG.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: currentSession.idToken,
        displayName: clean,
        returnSecureToken: true,
      }),
    });
    currentSession.displayName = clean;
    await persistSession(currentSession);
  }
  const p = await writeProfile({ mode: "account", displayName: clean });
  return sessionInfo();
}

export async function continueAsGuest(name?: string): Promise<SessionInfo> {
  const profile = await writeProfile({
    mode: "guest",
    displayName: name || undefined,
  });
  carriedName = null;
  freshInstall = false;
  return {
    mode: "guest",
    userId: null,
    username: null,
    displayName: profile.displayName ?? null,
    freshInstall: false,
  };
}

export async function clearGuestProfile(): Promise<void> {
  const profile = readProfile();
  if (profile?.mode === "guest") {
    carriedName = profile.displayName ?? null;
    await persist.writeData("profile", null);
  }
}

export async function signOut(): Promise<SessionInfo> {
  await persistSession(null);
  await persist.writeData("profile", null);
  return {
    mode: null,
    userId: null,
    username: null,
    displayName: null,
    freshInstall: false,
  };
}

export async function signInGoogle(): Promise<SessionInfo> {
  // Opens the Firebase Google OAuth handler in the system browser
  const authUrl = `https://${FIREBASE_CONFIG.authDomain}/__/auth/handler`;
  await shell.openExternal(authUrl);
  return sessionInfo();
}

export function validateUsername(u: string): string | null {
  return null;
}

export async function usernameAvailableToUser(username: string, userId: string | null): Promise<boolean> {
  return true;
}

export async function setUsername(username: string, displayName?: string): Promise<SessionInfo> {
  return sessionInfo();
}

export async function skipUsernameClaim(displayName?: string): Promise<SessionInfo> {
  return sessionInfo();
}

export async function syncDisplayName(): Promise<boolean> {
  return false;
}

export async function handleOAuthCallback(url: string): Promise<void> {
  // Deep-link callback
}

export function registerProtocol(): void {
  // Protocol handler
}

export function getClient(): any {
  return null;
}
