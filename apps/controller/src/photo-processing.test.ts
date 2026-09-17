import { describe, expect, it } from "vitest";
import {
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_EDGE,
  calculatePhotoDimensions,
} from "./photo-processing";

describe("photo preparation bounds", () => {
  it("shrinks landscape and portrait images without stretching them", () => {
    expect(calculatePhotoDimensions(4032, 3024)).toEqual({
      width: 512,
      height: 384,
    });
    expect(calculatePhotoDimensions(3024, 4032)).toEqual({
      width: 384,
      height: 512,
    });
  });

  it("does not enlarge small images", () => {
    expect(calculatePhotoDimensions(320, 240)).toEqual({
      width: 320,
      height: 240,
    });
  });

  it("keeps the provisional M0 output settings explicit", () => {
    expect(PHOTO_MAX_EDGE).toBe(512);
    expect(PHOTO_JPEG_QUALITY).toBe(0.82);
  });
});
