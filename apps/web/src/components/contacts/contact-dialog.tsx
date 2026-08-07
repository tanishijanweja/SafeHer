"use client";

import { useForm } from "@tanstack/react-form";
import { X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@safe-her/ui/components/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@safe-her/ui/components/dialog";
import { Input } from "@safe-her/ui/components/input";
import { Label } from "@safe-her/ui/components/label";

import {
  createContact,
  updateContact,
  type TrustedContact,
} from "@/lib/api";
import { isValidPhone, normalizePhone } from "@/lib/phone";

const contactFormSchema = z.object({
  name: z.string().trim().min(2, "Enter a name (min 2 characters)").max(80, "Name is too long"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .refine((value) => isValidPhone(value), {
      message: "Enter a valid phone number (10-15 digits)",
    }),
});

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: TrustedContact | null;
  onSaved: (contact: TrustedContact) => void;
}) {
  const isEdit = Boolean(contact);

  const form = useForm({
    defaultValues: {
      name: contact?.name ?? "",
      phone: contact?.phone ?? "",
    },
    validators: {
      onSubmit: contactFormSchema,
    },
    onSubmit: async ({ value }) => {
      const payload = {
        name: value.name.trim(),
        phone: normalizePhone(value.phone),
      };
      try {
        if (contact) {
          const updated = await updateContact(contact.id, payload);
          toast.success("Contact updated");
          onSaved(updated);
        } else {
          const created = await createContact(payload);
          toast.success("Contact added");
          onSaved(created);
        }
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    },
  });

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle>
                {isEdit ? "Edit contact" : "Add trusted contact"}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Update this contact's details."
                  : "They'll receive your SOS alerts in an emergency."}
              </DialogDescription>
            </div>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label="Close dialog"
                />
              }
            >
              <X />
            </DialogClose>
          </div>

          <form
            className="mt-5 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field name="name">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>Name</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-xs text-red-500">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>

            <form.Field name="phone">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>Phone number</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="tel"
                    inputMode="tel"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-xs text-red-500">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>

            <div className="mt-1 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isSubmitting: state.isSubmitting,
                })}
              >
                {({ canSubmit, isSubmitting }) => (
                  <Button
                    type="submit"
                    disabled={!canSubmit || isSubmitting}
                  >
                    {isSubmitting ? "Saving..." : isEdit ? "Save changes" : "Add contact"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
