"use client";

import { useState } from "react";

interface ApproveButtonProps {
  entityId: string;
  stage: string;
  onApproved?: () => void;
}

export function ApproveButton({ entityId, stage, onApproved }: ApproveButtonProps) {
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/entities/${entityId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal: "human_approved" }),
      });
      if (res.ok) {
        setApproved(true);
        onApproved?.();
      }
    } finally {
      setApproving(false);
    }
  }

  if (approved) {
    return <span className="rounded-md bg-green-600/20 text-green-400 px-3 py-1.5 text-sm font-medium">Approved</span>;
  }

  return (
    <button
      type="button"
      onClick={handleApprove}
      disabled={approving}
      className="rounded-md bg-amber-600 text-white px-4 py-1.5 text-sm font-bold hover:bg-amber-700 disabled:opacity-50"
    >
      {approving ? "Approving..." : `Approve ${stage}`}
    </button>
  );
}
