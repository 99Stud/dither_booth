import {
  hashRegistrationCode,
  registrationSchema,
} from "@dither-booth/protocol/registration";
import { assertEquals } from "@std/assert";

import { type ClaimedBooth, handleRegister } from "./handler.ts";

const BOOTH: ClaimedBooth = {
  boothId: "0f3e9c7a-5b1d-4c2e-8a6f-1d2c3b4a5e6f",
  orgId: "8b1c2d3e-4f5a-4b6c-9d7e-0a1b2c3d4e5f",
  boothName: "Booth A",
  previousAuthUserId: null,
};
const SESSION = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: 1793000000,
};

function setup(booth: ClaimedBooth | null = BOOTH) {
  const claimed: string[] = [];
  const sessions: ClaimedBooth[] = [];
  const deps = {
    claim: (hash: string) => {
      claimed.push(hash);
      return Promise.resolve(booth);
    },
    createSession: (b: ClaimedBooth) => {
      sessions.push(b);
      return Promise.resolve(SESSION);
    },
  };
  return { deps, claimed, sessions };
}

const post = (body: unknown) =>
  new Request("https://hub.test/functions/v1/register-booth", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

Deno.test("trades a code for the booth and a session", async () => {
  const { deps, claimed, sessions } = setup();
  const res = await handleRegister(post({ code: "7KQ2M-9XD4T" }), deps);
  assertEquals(res.status, 200);
  const body = registrationSchema.parse(await res.json());
  assertEquals(body, {
    booth: { id: BOOTH.boothId, name: "Booth A" },
    session: SESSION,
  });
  assertEquals(claimed, [await hashRegistrationCode("7KQ2M9XD4T")]);
  assertEquals(sessions, [BOOTH]);
});

Deno.test("hashes the code as typed by a person, however it is written", async () => {
  const { deps, claimed } = setup();
  await handleRegister(post({ code: " 7kq2m 9xd4t " }), deps);
  assertEquals(claimed, [await hashRegistrationCode("7KQ2M9XD4T")]);
});

Deno.test("says the same thing for an unknown, used or expired code", async () => {
  const { deps, sessions } = setup(null);
  const res = await handleRegister(post({ code: "7KQ2M-9XD4T" }), deps);
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: "unknown, used or expired code" });
  assertEquals(sessions.length, 0);
});

Deno.test("refuses a malformed code before looking it up", async () => {
  const { deps, claimed } = setup();
  const res = await handleRegister(post({ code: "nope" }), deps);
  assertEquals(res.status, 400);
  assertEquals(claimed.length, 0);
});

Deno.test("refuses a body that is not JSON, and anything but POST", async () => {
  const { deps } = setup();
  assertEquals((await handleRegister(post("{nope"), deps)).status, 400);
  const get = new Request("https://hub.test/", { method: "GET" });
  assertEquals((await handleRegister(get, deps)).status, 405);
});

Deno.test("answers 500 without leaking the cause when the session can't be made", async () => {
  const { deps } = setup();
  const original = console.error;
  console.error = () => {};
  try {
    const res = await handleRegister(post({ code: "7KQ2M-9XD4T" }), {
      ...deps,
      createSession: () => Promise.reject(new Error("service_role=secret")),
    });
    assertEquals(res.status, 500);
    assertEquals(await res.json(), {
      error: "registration failed, issue a new code",
    });
  } finally {
    console.error = original;
  }
});

Deno.test("answers 500 without leaking the cause when the code can't be looked up", async () => {
  const { deps, sessions } = setup();
  const original = console.error;
  console.error = () => {};
  try {
    const res = await handleRegister(post({ code: "7KQ2M-9XD4T" }), {
      ...deps,
      claim: () => Promise.reject(new Error("Legacy API keys are disabled")),
    });
    assertEquals(res.status, 500);
    assertEquals(await res.json(), { error: "registration failed, try again" });
    assertEquals(sessions.length, 0);
  } finally {
    console.error = original;
  }
});
