import React from "react";
import heroBubbles from "../assets/bubble-blower.jpg";

export function Header() {
  return (
    <div
      className="pps-hero my-3"
      style={{ backgroundImage: `url(${heroBubbles})` }}
    >
      <h1 className="display-5 fw-bold mt-2 mb-1">Photo Privacy Scrubber</h1>
      <div>
        <span className="pps-subtitle">
          Redact Faces • Redact Plates • Strip EXIF • No Data Leaves Your
          Browser!
        </span>
      </div>
    </div>
  );
}

export default React.memo(Header);
