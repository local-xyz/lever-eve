"use client";

import { type SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@web/components/ui/button";
import { DialogFooter } from "@web/components/ui/dialog";
import { FieldGroup } from "@web/components/ui/field";
import { serializeContactVaultPayload } from "@shared/vault/schema";
import { useVaultSetupRequestId } from "../setup";
import { api } from "@web/trpc/client";
import { FormField } from "../field";

const contactFormSchema = z
  .object({
    email: z.string().trim(),
    fullName: z.string().trim(),
    nickname: z
      .string()
      .trim()
      .min(1, "Enter a name for this contact.")
      .max(120),
    phone: z.string().trim(),
  })
  .superRefine((form, context) => {
    if (form.email && !z.email().safeParse(form.email).success) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid email address.",
        path: ["email"],
      });
    }
  })
  .refine((form) => [form.email, form.fullName, form.phone].some(Boolean), {
    message: "Enter at least one contact value.",
    path: ["fullName"],
  });

export function ContactForm({
  initialLabel = "",
  onSaved,
}: {
  readonly initialLabel?: string;
  readonly onSaved: () => void;
}) {
  const router = useRouter();
  const setupRequestId = useVaultSetupRequestId("contact");
  const [notified, setNotified] = useState(false);
  const create = api.vault.create.useMutation({
    onSuccess: (saved) => {
      router.refresh();
      if (saved.notificationQueued) setNotified(true);
      else onSaved();
    },
  });
  const [attempted, setAttempted] = useState(false);
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    nickname: initialLabel,
    phone: "",
  });
  const result = contactFormSchema.safeParse(form);
  const errors =
    attempted && !result.success
      ? z.flattenError(result.error).fieldErrors
      : {};

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (!result.success) return;
    create.mutate({
      setupRequestId,
      account: "",
      kind: "contact",
      label: result.data.nickname,
      secret: serializeContactVaultPayload({
        email: result.data.email.length ? result.data.email : undefined,
        fullName: result.data.fullName.length
          ? result.data.fullName
          : undefined,
        kind: "contact",
        phone: result.data.phone.length ? result.data.phone : undefined,
        version: 1,
      }),
    });
  };

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  if (notified)
    return (
      <div className="space-y-4">
        <output>
          Saved securely. Lever will be notified automatically and continue when
          the remaining details are ready.
        </output>
        <Button onClick={onSaved} type="button">
          Done
        </Button>
      </div>
    );

  return (
    <form noValidate onSubmit={submit}>
      {create.error ? <p role="alert">{create.error.message}</p> : null}
      <FieldGroup>
        <FormField
          error={errors.nickname?.[0]}
          id="vault-contact-label"
          label="Name"
          onChange={(value) => {
            update("nickname", value);
          }}
          placeholder="Checkout"
          value={form.nickname}
        />
        <FormField
          autoComplete="name"
          error={errors.fullName?.[0]}
          id="vault-contact-name"
          label="Full name (optional)"
          onChange={(value) => {
            update("fullName", value);
          }}
          value={form.fullName}
        />
        <FormField
          autoComplete="email"
          error={errors.email?.[0]}
          id="vault-contact-email"
          label="Email (optional)"
          onChange={(value) => {
            update("email", value);
          }}
          type="email"
          value={form.email}
        />
        <FormField
          autoComplete="tel"
          error={errors.phone?.[0]}
          id="vault-contact-phone"
          label="Phone (optional)"
          onChange={(value) => {
            update("phone", value);
          }}
          type="tel"
          value={form.phone}
        />
      </FieldGroup>
      <DialogFooter>
        <Button disabled={create.isPending} type="submit">
          Save contact
        </Button>
      </DialogFooter>
    </form>
  );
}
