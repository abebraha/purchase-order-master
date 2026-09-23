import { z } from "zod";
import { DEFAULT_SETTINGS, PO_TYPES, SettingsSchema, type AppSettings, type POType } from "@shared/po";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The shared SettingsSchema, plus a friendly check that the company email looks like one
 * (it's printed on every purchase order, so a typo is worth catching).
 */
export const settingsFormSchema = SettingsSchema.extend({
  company: SettingsSchema.shape.company.extend({
    email: z
      .string()
      .trim()
      .refine((v) => !v || EMAIL_RE.test(v), "Enter a valid email, like name@company.com"),
  }),
});

/** Server settings → complete form values (older rows may be missing newer fields). */
export function toFormValues(s: AppSettings | undefined): AppSettings {
  const d = DEFAULT_SETTINGS;
  const poType = s?.defaults?.poType;
  return {
    company: {
      name: s?.company?.name ?? d.company.name,
      address: s?.company?.address ?? "",
      email: s?.company?.email ?? "",
      phone: s?.company?.phone ?? "",
    },
    defaults: {
      poType: (PO_TYPES as readonly string[]).includes(poType ?? "") ? (poType as POType) : d.defaults.poType,
      terms: s?.defaults?.terms ?? d.defaults.terms,
      shipTo: s?.defaults?.shipTo ?? "",
      billTo: s?.defaults?.billTo ?? "",
    },
    documentFooter: s?.documentFooter ?? "",
  };
}

/** "Company\nStreet\nCity" block used for the Bill To shortcut. */
export function companyAddressBlock(company: Partial<AppSettings["company"]> | undefined): string {
  return [company?.name?.trim(), company?.address?.trim()].filter(Boolean).join("\n");
}
