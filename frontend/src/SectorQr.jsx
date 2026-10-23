import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function SectorQr({ slug }) {
  const [open, setOpen] = useState(false);
  const url = `${window.location.origin}/pesquisa/${slug}`;
  return (
    <div className="sector-qr">
      <button className="small-action" onClick={() => setOpen((v) => !v)}>
        {open ? "Fechar QR" : "Link e QR Code"}
      </button>
      {open && (
        <div className="qr-card">
          <QRCodeSVG value={url} size={144} level="M" />
          <a href={url}>{url}</a>
          <button
            className="small-action"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
              } catch {}
            }}
          >
            Copiar link
          </button>
        </div>
      )}
    </div>
  );
}
