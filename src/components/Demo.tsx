import React from "react";

interface DemoProps {
  onClick?: () => void;
  disabled?: boolean;
}

const Demo: React.FC<DemoProps> = ({ onClick, disabled }) => (
  <button
    type="button"
    className="btn btn-sm ms-2"
    style={{
      backgroundColor: "#337ccc",
      borderColor: "#337ccc",
      color: "#fff",
    }}
    onClick={onClick}
    disabled={disabled}
  >
    Demo
  </button>
);

export default React.memo(Demo);
