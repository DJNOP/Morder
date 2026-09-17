import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinQrCode } from "./JoinQrCode";

describe("join QR code", () => {
  it("renders a titled local SVG from the complete public join URL", () => {
    const markup = renderToStaticMarkup(
      <JoinQrCode
        joinUrl="http://192.168.1.42:5184/?room=ABCD"
        roomCode="ABCD"
      />,
    );
    const otherRoomMarkup = renderToStaticMarkup(
      <JoinQrCode
        joinUrl="http://192.168.1.42:5184/?room=EFGH"
        roomCode="EFGH"
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("<title>Join room ABCD</title>");
    expect(markup).not.toContain("reconnectToken");
    expect(otherRoomMarkup).not.toBe(markup);
  });
});
