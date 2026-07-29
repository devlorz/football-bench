import { afterEach, describe, expect, test, vi } from "vitest";
import { nodeHttpFetcher } from "../src/http.js";

describe("the Node HTTP fetcher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("aborts an upstream request that exceeds its timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = options?.signal;
          if (!(signal instanceof AbortSignal)) {
            reject(new Error("The request did not carry an AbortSignal"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => reject(signal.reason),
            { once: true }
          );
        }))
    );

    await expect(nodeHttpFetcher(
      "https://example.test/hangs",
      { method: "GET", timeoutMs: 5 }
    )).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
