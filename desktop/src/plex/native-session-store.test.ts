import { describe, expect, test } from "bun:test";
import { NativeSessionStore } from "./native-session-store";

describe("native session store", () => {
  test("refuses to overwrite a corrupt legacy session", async () => {
    let writes = 0;
    const store = new NativeSessionStore({
      read: async () => "not-json",
      write: async () => {
        writes++;
      },
    });
    await expect(store.read()).rejects.toThrow();
    expect(writes).toBe(0);
  });
});
