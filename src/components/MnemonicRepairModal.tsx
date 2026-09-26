import { createPortal } from "react-dom";
import { RepairWorkspace } from "./repair-workspace/RepairWorkspace";

interface MnemonicRepairModalProps {
  isOpen: boolean;
  initialPhrase?: string;
  onClose: () => void;
  onApplyRepairedPhrase?: (phrase: string) => void;
}

export function MnemonicRepairModal({
  isOpen,
  initialPhrase = "",
  onClose,
  onApplyRepairedPhrase,
}: MnemonicRepairModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="repair-modal-workspace-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "98vw",
          maxWidth: "1680px",
          height: "calc(100vh - 36px)",
          maxHeight: "920px",
          display: "flex",
          flexDirection: "column",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <RepairWorkspace
          initialPhrase={initialPhrase}
          onBackToVault={onClose}
          onApplyRepairedPhrase={onApplyRepairedPhrase}
        />
      </div>
    </div>,
    document.body
  );
}
