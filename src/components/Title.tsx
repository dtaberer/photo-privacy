import heroBubbles from "../assets/bubble-blower.jpg";

export function Title() {
  // Inline background to guarantee precedence over any external CSS
  const heroStyle: React.CSSProperties = {
    // vivid blue photo background; no overlay
    backgroundColor: "#1f62c9",
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
    <div className="pps-hero my-3" style={heroStyle}>
      <h1 className="pps-heading">Photo Privacy Scrubber</h1>
      <p className="pps-subtitle">
        Blur or pixelate faces and text locally. No uploads.
      </p>
    </div>
  );
}
