import { z } from "zod";

export const StyleFormSchema = z.object({
  styleNumber: z.string().min(1, "Style number is required"),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const POFormSchema = z.object({
  poNumber: z.string().min(1, "PO number is required"),
  poType: z.enum(["Bulk", "Regular PO"], {
    required_error: "Please select a PO type",
  }),
  terms: z.enum(["Net 30", "Net 45", "Net 60", "Other"], {
    required_error: "Please select payment terms",
  }),
  orderDate: z.date(),
  shipTo: z.string().min(1, "Ship to address is required"),
  billTo: z.string().min(1, "Bill to address is required"),
  startShipDate: z.date(),
  cancelDate: z.date(),
  items: z.array(z.object({
    styleId: z.number(),
    manualStyleNumber: z.string(),
    color: z.string().min(1, "Color is required"),
    description: z.string().min(1, "Description is required"),
    quantity: z.number().min(1, "Quantity must be at least 1"),
    price: z.number().min(0.01, "Price must be greater than 0"),
  })).min(1, "At least one item is required"),
});

export type StyleFormValues = z.infer<typeof StyleFormSchema>;
export type POFormValues = z.infer<typeof POFormSchema> & {
  id?: number;
};