import bcrypt from "bcryptjs";

// Where passwords are checked and stored.
//  - default: the User.passwordHash column (bcrypt), as before - Vercel, local dev, tests.
//  - AUTH_PROVIDER=firebase: Firebase Authentication holds the password and lists the user in the
//    Firebase console. A user's Firebase UID is always their User.id, so the two never drift apart.
// The database row (role, agency, status) stays the source of truth for who a person is and what
// they may see; Firebase only answers "is this the right password". passwordHash is kept up to
// date in both modes so the app can always be moved back to the plain database login.

export function firebaseEnabled(): boolean {
  return process.env.AUTH_PROVIDER === "firebase";
}

export class IdentityError extends Error {}

type Admin = { auth: () => import("firebase-admin/auth").Auth };
let adminPromise: Promise<Admin> | null = null;

async function adminAuth() {
  adminPromise ??= (async () => {
    const { getApps, initializeApp, applicationDefault } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
    return { auth: () => getAuth(app) };
  })();
  return (await adminPromise).auth();
}

const code = (e: unknown) => (e as { code?: string })?.code ?? "";

// Checks an email + password with Firebase. Returns the Firebase UID, "not-found" when Firebase has
// no such user yet, or null for a wrong password / disabled account.
async function firebaseSignIn(email: string, password: string): Promise<string | "not-found" | null> {
  const key = process.env.FIREBASE_WEB_API_KEY;
  if (!key) throw new IdentityError("FIREBASE_WEB_API_KEY is not set");
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  const body = (await res.json().catch(() => null)) as { localId?: string; error?: { message?: string } } | null;
  if (res.ok) return body?.localId ?? null;
  const reason = body?.error?.message ?? "";
  if (reason.startsWith("EMAIL_NOT_FOUND")) return "not-found";
  if (/^(INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS|USER_DISABLED|INVALID_EMAIL|MISSING_PASSWORD)/.test(reason)) return null;
  throw new IdentityError(`Sign-in service error: ${reason || res.status}`);
}

export async function createIdentity(user: { id: string; email: string; name: string; password: string; disabled?: boolean }) {
  if (!firebaseEnabled()) return;
  try {
    await (await adminAuth()).createUser({ uid: user.id, email: user.email, password: user.password, displayName: user.name, disabled: !!user.disabled });
  } catch (e) {
    if (code(e) === "auth/uid-already-exists" || code(e) === "auth/email-already-exists") {
      await (await adminAuth()).updateUser(user.id, { password: user.password, displayName: user.name, disabled: !!user.disabled });
      return;
    }
    throw new IdentityError(`Could not create the sign-in account: ${code(e) || (e as Error).message}`);
  }
}

export async function setIdentityPassword(userId: string, password: string) {
  if (!firebaseEnabled()) return;
  try {
    await (await adminAuth()).updateUser(userId, { password });
  } catch (e) {
    throw new IdentityError(`Could not change the password: ${code(e) || (e as Error).message}`);
  }
}

// Best effort: the database row's status is what actually blocks a login, so a failure here is not fatal.
export async function setIdentityDisabled(userId: string, disabled: boolean) {
  if (!firebaseEnabled()) return;
  try {
    await (await adminAuth()).updateUser(userId, { disabled });
  } catch (e) {
    console.error("identity: could not update disabled flag", userId, code(e));
  }
}

export async function deleteIdentity(userId: string) {
  if (!firebaseEnabled()) return;
  try {
    await (await adminAuth()).deleteUser(userId);
  } catch (e) {
    if (code(e) !== "auth/user-not-found") console.error("identity: could not delete", userId, code(e));
  }
}

// True if `password` is right for this user.
export async function verifyPassword(user: { id: string; email: string; name: string; passwordHash: string }, password: string): Promise<boolean> {
  if (!firebaseEnabled()) return bcrypt.compare(password, user.passwordHash);

  const result = await firebaseSignIn(user.email, password);
  if (result === "not-found") {
    // A user who was never copied into Firebase: accept the stored password once and create them,
    // so nobody is locked out by a missed import.
    if (!(await bcrypt.compare(password, user.passwordHash))) return false;
    await createIdentity({ id: user.id, email: user.email, name: user.name, password });
    return true;
  }
  // The Firebase account must be this very user (UID == User.id), never a look-alike.
  return result === user.id;
}

const identityToolkit = (method: string) =>
  `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY ?? "")}`;

// Asks Firebase to email the user its password-reset message (the sending is Firebase's own mail service).
// The link in that email carries an oobCode and opens whatever "action URL" the Firebase console's
// Authentication > Templates > Password reset is set to - point it at <app>/reset-password.
export async function sendFirebaseResetEmail(user: { id: string; email: string; name: string }): Promise<boolean> {
  if (!process.env.FIREBASE_WEB_API_KEY) throw new IdentityError("FIREBASE_WEB_API_KEY is not set");
  const send = () =>
    fetch(identityToolkit("sendOobCode"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email: user.email }),
    });
  let res = await send();
  let reason = res.ok ? "" : ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
  if (reason.startsWith("EMAIL_NOT_FOUND")) {
    // Never copied into Firebase: create them with a throwaway password (replaced when they reset), then retry.
    const tmp = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
    await createIdentity({ id: user.id, email: user.email, name: user.name, password: tmp });
    res = await send();
    reason = res.ok ? "" : ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
  }
  if (!res.ok) throw new IdentityError(`Could not send the reset email: ${reason || res.status}`);
  return true;
}

// Finishes a Firebase reset: checks the emailed oobCode and sets the new password. Returns the account's
// email, or null if the code is invalid / expired / already used.
export async function confirmFirebaseReset(oobCode: string, newPassword: string): Promise<string | null> {
  if (!process.env.FIREBASE_WEB_API_KEY) throw new IdentityError("FIREBASE_WEB_API_KEY is not set");
  const res = await fetch(identityToolkit("resetPassword"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oobCode, newPassword }),
  });
  const body = (await res.json().catch(() => null)) as { email?: string; error?: { message?: string } } | null;
  if (res.ok) return body?.email?.toLowerCase() ?? null;
  const reason = body?.error?.message ?? "";
  if (/^(INVALID_OOB_CODE|EXPIRED_OOB_CODE|OPERATION_NOT_ALLOWED|WEAK_PASSWORD|USER_DISABLED)/.test(reason)) return null;
  throw new IdentityError(`Reset service error: ${reason || res.status}`);
}
