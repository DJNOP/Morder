import { describe, expect, it } from "vitest";
import {
  buildPlayerJoinUrl,
  parseRoomQuery,
  removeRoomQueryFromUrl,
} from "../src/index.js";

describe("player join URL", () => {
  it("constructs a LAN player URL with a room code", () => {
    expect(buildPlayerJoinUrl("192.168.1.42", "ABCD")).toBe(
      "http://192.168.1.42:5184/?room=ABCD",
    );
  });

  it("encodes room values instead of interpolating query text", () => {
    expect(buildPlayerJoinUrl("10.0.0.2", "AB&C", 6000)).toBe(
      "http://10.0.0.2:6000/?room=AB%26C",
    );
  });

  it("extracts and normalizes exactly one valid room query", () => {
    expect(parseRoomQuery("?room=abcd")).toEqual({
      status: "valid",
      roomCode: "ABCD",
    });
    expect(parseRoomQuery("?room=ABCD&room=EFGH")).toEqual({
      status: "invalid",
    });
    expect(parseRoomQuery("?room=ABC!")).toEqual({ status: "invalid" });
  });

  it("preserves manual joining when no room query exists", () => {
    expect(parseRoomQuery("?other=value")).toEqual({ status: "missing" });
  });

  it("removes only the consumed room query", () => {
    expect(
      removeRoomQueryFromUrl(
        "http://192.168.1.42:5184/?room=ABCD&source=test#join",
      ),
    ).toBe("/?source=test#join");
  });
});
