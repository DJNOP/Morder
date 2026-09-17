import { QRCodeSVG } from "qrcode.react";

interface JoinQrCodeProps {
  joinUrl: string;
  roomCode: string;
}

export const JoinQrCode = ({ joinUrl, roomCode }: JoinQrCodeProps) => (
  <div className="qr-frame">
    <QRCodeSVG
      value={joinUrl}
      size={320}
      level="M"
      marginSize={4}
      bgColor="#ffffff"
      fgColor="#111214"
      title={`Join room ${roomCode}`}
    />
  </div>
);
