import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Combobox } from "@/components/ui/combobox";
import { Separator } from "@/components/ui/separator";
import { POFormSchema, type POFormValues } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import type { Style } from "@db/schema";

interface Props {
  onSubmit: (data: POFormValues) => void;
}

export default function PurchaseOrderForm({ onSubmit }: Props) {
  const { toast } = useToast();
  const { data: styles } = useQuery<Style[]>({ queryKey: ["/api/styles"] });

  const form = useForm<POFormValues>({
    resolver: zodResolver(POFormSchema),
    defaultValues: {
      poNumber: "",
      poType: "Regular PO",
      terms: "Net 30",
      orderDate: new Date(),
      shipTo: "",
      billTo: "",
      startShipDate: new Date(),
      cancelDate: new Date(),
      items: [{ styleId: 0, quantity: 1, price: 0, color: "", description: "" }],
    },
  });

  const checkPONumberMutation = useMutation({
    mutationFn: async (poNumber: string) => {
      console.log("Checking PO number:", poNumber);
      const res = await fetch(`/api/purchase-orders/check/${encodeURIComponent(poNumber)}`);
      if (!res.ok) {
        throw new Error("Failed to check PO number. Please try again.");
      }
      const data = await res.json();
      console.log("PO check response:", data);
      return data.exists;
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: POFormValues) => {
      console.log("Submitting form data:", data);

      try {
        // First check if PO number exists
        const exists = await checkPONumberMutation.mutateAsync(data.poNumber);
        if (exists) {
          throw new Error("This PO number already exists. Please use a different number.");
        }

        const res = await fetch("/api/purchase-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Failed to create purchase order");
        }

        return res.json();
      } catch (error) {
        console.error("Error in mutation:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Purchase order created successfully:", data);
      onSubmit(form.getValues());
      toast({
        title: "Success",
        description: "Purchase order created successfully.",
      });
    },
    onError: (error: Error) => {
      console.error("Error creating purchase order:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create purchase order. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onFormSubmit = async (data: POFormValues) => {
    console.log("Form submitted with data:", data);
    if (Object.keys(form.formState.errors).length > 0) {
      console.log("Form validation errors:", form.formState.errors);
      return;
    }

    try {
      await mutation.mutateAsync(data);
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  // Function to handle style selection and auto-fill color and description
  const handleStyleSelect = (index: number, styleId: number) => {
    const selectedStyle = styles?.find(style => style.id === styleId);
    if (selectedStyle) {
      form.setValue(`items.${index}.styleId`, styleId);
      form.setValue(`items.${index}.color`, selectedStyle.color);
      form.setValue(`items.${index}.description`, selectedStyle.description);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-8">
        {/* PO Information Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Purchase Order Information</h3>
          <div className="grid gap-6 md:grid-cols-3">
            <FormField
              control={form.control}
              name="poNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PO Number</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter PO number" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="terms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Terms</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="Net 30">Net 30</option>
                      <option value="Net 45">Net 45</option>
                      <option value="Net 60">Net 60</option>
                      <option value="Other">Other</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="poType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PO Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex space-x-4"
                    >
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <RadioGroupItem value="Regular PO" />
                        </FormControl>
                        <FormLabel className="font-normal">Regular PO</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <RadioGroupItem value="Bulk" />
                        </FormControl>
                        <FormLabel className="font-normal">Bulk</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Address Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Addresses</h3>
          <div className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="billTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bill To</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="shipTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ship To</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Dates Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Important Dates</h3>
          <div className="grid gap-6 md:grid-cols-3">
            <FormField
              control={form.control}
              name="orderDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value?.toISOString().split('T')[0]}
                      onChange={e => field.onChange(new Date(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startShipDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Ship Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value?.toISOString().split('T')[0]}
                      onChange={e => field.onChange(new Date(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cancelDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cancel Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value?.toISOString().split('T')[0]}
                      onChange={e => field.onChange(new Date(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Items Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Order Items</h3>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const items = form.getValues("items");
                form.setValue("items", [
                  ...items,
                  { styleId: 0, quantity: 1, price: 0, color: "", description: "" },
                ]);
              }}
            >
              Add Item
            </Button>
          </div>

          {form.watch("items").map((_, index) => (
            <div key={index} className="grid gap-4 md:grid-cols-5 items-start p-4 border rounded-lg">
              <FormField
                control={form.control}
                name={`items.${index}.styleId`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Style Number</FormLabel>
                    <FormControl>
                      <Combobox
                        items={styles?.map((style) => ({
                          value: style.id.toString(),
                          label: style.styleNumber
                        })) || []}
                        value={field.value.toString()}
                        onSelect={(value) => handleStyleSelect(index, parseInt(value))}
                        placeholder="Search style number"
                        emptyMessage="No style numbers found."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`items.${index}.color`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`items.${index}.description`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`items.${index}.quantity`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`items.${index}.price`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={e => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-6">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Generating..." : "Generate Purchase Order"}
          </Button>
        </div>
      </form>
    </Form>
  );
}