import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { thumbUrl } from "../api";

export default function Tile({ item, onOpen }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="tile" onClick={() => onOpen(item)}>
      <img
        src={thumbUrl(item.hash)}
        alt=""
        loading="lazy"
        decoding="async"
        className={loaded ? "loaded" : ""}
        onLoad={() => setLoaded(true)}
      />
      {!loaded && <div className="skeleton" />}
      {item.live && (
        <div className="live-badge" title="Live Photo">
          <PlayCircle size={14} strokeWidth={2.2} fill="rgba(255,255,255,0.0)" />
        </div>
      )}
    </div>
  );
}
