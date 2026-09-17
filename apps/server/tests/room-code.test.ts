import { describe, expect, it } from "vitest";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  isRoomCode,
} from "@morder/shared";
import { generateRoomCode } from "../src/room-code.js";

describe("room-code generator", () => {
  it("uses the allowed uppercase, non-ambiguous format", () => {
    for (let index = 0; index < 100; index += 1) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isRoomCode(code)).toBe(true);
      expect([...code].every((character) => ROOM_CODE_ALPHABET.includes(character))).toBe(
        true,
      );
    }
  });
});
