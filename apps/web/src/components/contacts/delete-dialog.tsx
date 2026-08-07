"use client";

import { Button } from "@safe-her/ui/components/button";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@safe-her/ui/components/dialog";

import type { TrustedContact } from "@/lib/api";

export function DeleteContactDialog({
  contact,
  onOpenChange,
  onConfirm,
  pending,
}: {
  contact: TrustedContact | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (contact: TrustedContact) => void;
  pending?: boolean;
}) {
  const open = Boolean(contact);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup>
          <div className="space-y-1">
            <DialogTitle>Delete contact?</DialogTitle>
            <DialogDescription>
              {contact ? (
                <>
                  This will remove <span className="font-medium text-foreground">{contact.name}</span>{" "}
                  from your trusted contacts. They will no longer receive your SOS alerts.
                </>
              ) : null}
            </DialogDescription>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (contact) onConfirm(contact);
              }}
            >
              {pending ? "Deleting..." : "Delete contact"}
            </Button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
