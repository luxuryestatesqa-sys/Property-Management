import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";

const createUser = vi.fn();
const updateUser = vi.fn();
vi.mock("firebase-admin/app", () => ({ getApps: () => [], initializeApp: () => ({}), applicationDefault: () => ({}) }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ createUser, updateUser, deleteUser: vi.fn() }) }));

import { verifyPassword, createIdentity, setIdentityPassword } from "./identity";

const hash = bcrypt.hashSync("right-pass", 4);
const user = { id: "u1", email: "a@x.test", name: "A", passwordHash: hash };
const fetchMock = vi.fn();
const reply = (ok: boolean, body: unknown) => fetchMock.mockResolvedValueOnce({ ok, json: async () => body });

beforeEach(() => {
  createUser.mockReset().mockResolvedValue({});
  updateUser.mockReset().mockResolvedValue({});
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("local mode (no AUTH_PROVIDER)", () => {
  it("checks the stored bcrypt hash and never calls Firebase", async () => {
    expect(await verifyPassword(user, "right-pass")).toBe(true);
    expect(await verifyPassword(user, "wrong")).toBe(false);
    await createIdentity({ id: "u1", email: "a@x.test", name: "A", password: "x" });
    await setIdentityPassword("u1", "x");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe("firebase mode", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_PROVIDER", "firebase");
    vi.stubEnv("FIREBASE_WEB_API_KEY", "key");
  });

  it("accepts a password Firebase confirms for this same user", async () => {
    reply(true, { localId: "u1" });
    expect(await verifyPassword(user, "anything")).toBe(true);
  });

  it("rejects a Firebase account that is a different user (uid mismatch)", async () => {
    reply(true, { localId: "someone-else" });
    expect(await verifyPassword(user, "anything")).toBe(false);
  });

  it("rejects wrong passwords and disabled accounts", async () => {
    reply(false, { error: { message: "INVALID_LOGIN_CREDENTIALS" } });
    expect(await verifyPassword(user, "bad")).toBe(false);
    reply(false, { error: { message: "USER_DISABLED" } });
    expect(await verifyPassword(user, "right-pass")).toBe(false);
  });

  it("creates a missing Firebase user the first time the stored password is right", async () => {
    reply(false, { error: { message: "EMAIL_NOT_FOUND" } });
    expect(await verifyPassword(user, "right-pass")).toBe(true);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ uid: "u1", email: "a@x.test", password: "right-pass" }));
  });

  it("does not create a Firebase user for a wrong password", async () => {
    reply(false, { error: { message: "EMAIL_NOT_FOUND" } });
    expect(await verifyPassword(user, "nope")).toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("throws (rather than saying 'wrong password') when the sign-in service itself fails", async () => {
    reply(false, { error: { message: "INTERNAL" } });
    await expect(verifyPassword(user, "x")).rejects.toThrow();
  });

  it("updates the existing account if the uid already exists when creating", async () => {
    createUser.mockRejectedValueOnce({ code: "auth/uid-already-exists" });
    await createIdentity({ id: "u1", email: "a@x.test", name: "A", password: "new" });
    expect(updateUser).toHaveBeenCalledWith("u1", expect.objectContaining({ password: "new" }));
  });
});
