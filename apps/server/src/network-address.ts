import { networkInterfaces } from "node:os";
import type { LocalNetworkAddress } from "@morder/shared";

export interface NetworkInterfaceEntry {
  address: string;
  family: string | number;
  internal: boolean;
}

export type NetworkInterfaceMap = Record<
  string,
  readonly NetworkInterfaceEntry[] | undefined
>;

const parseIpv4 = (address: string): [number, number, number, number] | null => {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number.parseInt(part, 10) : Number.NaN,
  );
  if (octets.some((octet) => !Number.isInteger(octet) || octet > 255)) {
    return null;
  }

  return octets as [number, number, number, number];
};

const isPrivateIpv4 = ([first, second]: [number, number, number, number]) =>
  first === 10 ||
  (first === 172 && second >= 16 && second <= 31) ||
  (first === 192 && second === 168);

const isUsableIpv4 = ([
  first,
  second,
  third,
]: [number, number, number, number]) =>
  first !== 0 &&
  first !== 127 &&
  !(first === 100 && second >= 64 && second <= 127) &&
  !(first === 169 && second === 254) &&
  !(first === 192 && second === 0 && (third === 0 || third === 2)) &&
  !(first === 192 && second === 88 && third === 99) &&
  !(first === 198 && (second === 18 || second === 19)) &&
  !(first === 198 && second === 51 && third === 100) &&
  !(first === 203 && second === 0 && third === 113) &&
  first < 224;

const preference = ([first, second]: [number, number, number, number]) => {
  if (first === 192 && second === 168) {
    return 0;
  }
  if (first === 10) {
    return 1;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return 2;
  }
  return 3;
};

const compareAddresses = (
  left: LocalNetworkAddress,
  right: LocalNetworkAddress,
) => {
  const leftOctets = parseIpv4(left.address);
  const rightOctets = parseIpv4(right.address);
  if (!leftOctets || !rightOctets) {
    return left.address.localeCompare(right.address);
  }

  const preferenceDifference = preference(leftOctets) - preference(rightOctets);
  if (preferenceDifference !== 0) {
    return preferenceDifference;
  }

  for (let index = 0; index < leftOctets.length; index += 1) {
    const difference = (leftOctets[index] ?? 0) - (rightOctets[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

export const discoverLocalNetworkAddresses = (
  interfaces: NetworkInterfaceMap = networkInterfaces(),
): LocalNetworkAddress[] => {
  const addresses = new Map<string, LocalNetworkAddress>();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      const octets = parseIpv4(entry.address);
      if (
        entry.internal ||
        (entry.family !== "IPv4" && entry.family !== 4) ||
        !octets ||
        !isUsableIpv4(octets)
      ) {
        continue;
      }

      addresses.set(entry.address, {
        address: entry.address,
        isPrivate: isPrivateIpv4(octets),
      });
    }
  }

  return [...addresses.values()].sort(compareAddresses);
};
