import React from "react";
import heroBubbles from "../assets/bubble-blower.jpg";

export function Header() {
  const heroStyle: React.CSSProperties = {
    // vivid blue photo background; no overlay
    // backgroundColor: "#1f62c9",
    borderRadius: "8px",
    backgroundImage: `url(${heroBubbles})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    minHeight: "300px", // Ensures the hero section is tall enough to show the background
    color: "#fff", // Ensures text is white for contrast on vivid blue/photo
    textShadow: "0 2px 8px rgba(0,0,0,0.5)", // Improves readability on photo
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  } as const;

  return (
    <div className="pps-hero my-3 " style={heroStyle}>
      <h1 className="display-5 fw-bold mt-2 mb-1">Photo Privacy Scrubber</h1>
      <div>
        <span className="pps-subtitle">
          Redact Faces • Redact Plates • Strip EXIF • No Data Leaves Your Browse
        </span>
      </div>
    </div>
  );
}

export default React.memo(Header);
