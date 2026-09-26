export function CustomCheckbox({
  checked,
  disabled,
  disabledReason,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className={`custom-checkbox-btn ${checked ? "is-checked" : ""} ${disabled ? "is-disabled" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange();
      }}
      disabled={disabled}
      data-tooltip={disabled ? disabledReason : checked ? "Deselect" : "Select wallet for batch sweep"}
      aria-label="Select wallet"
    >
      <div className="custom-checkbox-box">
        {checked && (
          <svg
            className="custom-checkbox-svg"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
          </svg>
        )}
      </div>
    </button>
  );
}
