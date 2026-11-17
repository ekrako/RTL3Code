import { expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  setAsDefaultProtocolClient: vi.fn(),
  registerSchemesAsPrivileged: vi.fn(),
  handle: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    hasSingleInstanceLock: () => true,
    setAsDefaultProtocolClient: mocks.setAsDefaultProtocolClient,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  protocol: { registerSchemesAsPrivileged: mocks.registerSchemesAsPrivileged },
  ipcMain: { handle: mocks.handle, removeHandler: vi.fn() },
  BrowserWindow: {},
  shell: {},
}));

import { createClerkBridge } from "@clerk/electron";

it.each([false, true])(
  "keeps OAuth app links separate from the renderer origin (dev=%s)",
  (development) => {
    mocks.setAsDefaultProtocolClient.mockClear();
    mocks.registerSchemesAsPrivileged.mockClear();
    mocks.handle.mockClear();
    const scheme = development ? "t3code-dev" : "t3code";
    const oauthScheme = development ? "rtl3code-dev" : "rtl3code";
    const options = {
      renderer: { scheme, host: "app", oauthScheme },
      manageSingleInstanceLock: false,
      storage: {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      },
    };
    const bridge = createClerkBridge(options);
    try {
      expect(mocks.setAsDefaultProtocolClient.mock.calls).toEqual([[oauthScheme]]);
      expect(mocks.registerSchemesAsPrivileged.mock.calls[0]?.[0]).toMatchObject([{ scheme }]);
      const redirect = mocks.handle.mock.calls.find(
        ([channel]) => channel === "clerk:oauth-transport:get-redirect-url",
      )?.[1];
      const frame = {};
      const url = new URL(
        redirect({ sender: { getType: () => "window", mainFrame: frame }, senderFrame: frame }),
      );
      expect(url.protocol).toBe(`${oauthScheme}:`);
      expect(url.host).toBe("app");
    } finally {
      bridge.cleanup();
    }
  },
);
