import { describe, expect, it } from "vitest";
import { discoverLocalNetworkAddresses } from "../src/network-address.js";

const entry = (
  address: string,
  options: { family?: string | number; internal?: boolean } = {},
) => ({
  address,
  family: options.family ?? "IPv4",
  internal: options.internal ?? false,
});

describe("local network address discovery", () => {
  it("keeps usable IPv4 addresses and prefers private LAN ranges", () => {
    expect(
      discoverLocalNetworkAddresses({
        loopback: [entry("127.0.0.1", { internal: true })],
        vpn: [entry("8.8.8.8")],
        ethernet: [entry("10.0.0.22"), entry("192.168.1.42")],
        duplicate: [entry("192.168.1.42")],
      }),
    ).toEqual([
      { address: "192.168.1.42", isPrivate: true },
      { address: "10.0.0.22", isPrivate: true },
      { address: "8.8.8.8", isPrivate: false },
    ]);
  });

  it("excludes unusable, malformed, and non-IPv4 entries", () => {
    expect(
      discoverLocalNetworkAddresses({
        unusable: [
          entry("169.254.1.2"),
          entry("203.0.113.4"),
          entry("999.1.1.1"),
          entry("::1", { family: "IPv6" }),
        ],
        missing: undefined,
      }),
    ).toEqual([]);
  });
});
