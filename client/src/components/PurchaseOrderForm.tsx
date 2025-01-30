import { useQueryClient } from "@tanstack/react-query";
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
import { Separator } from "@/components/ui/separator";
import { POFormSchema, type POFormValues } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import type { Style } from "@db/schema";

interface Props {
  onSubmit: (data: POFormValues) => void;
  defaultValues?: POFormValues;
  mode?: 'create' | 'edit';
}

export default function PurchaseOrderForm({ onSubmit, defaultValues, mode = 'create' }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: styles } = useQuery<Style[]>({ queryKey: ["/api/styles"] });

  // Convert string dates to Date objects for the form
  const formattedDefaultValues = defaultValues ? {
    ...defaultValues,
    orderDate: new Date(defaultValues.orderDate),
    startShipDate: new Date(defaultValues.startShipDate),
    cancelDate: new Date(defaultValues.cancelDate),
  } : undefined;

  const form = useForm<POFormValues>({
    resolver: zodResolver(POFormSchema),
    defaultValues: formattedDefaultValues || {
      poNumber: "",
      poType: "Regular PO",
      terms: "Net 30",
      orderDate: new Date(),
      shipTo: "",
      billTo: "",
      startShipDate: new Date(),
      cancelDate: new Date(),
      items: [{ styleId: 0, quantity: 1, price: 0, color: "", description: "", manualStyleNumber: "" }],
    },
  });

  const addStyleMutation = useMutation({
    mutationFn: async (styleNumber: string) => {
      const res = await fetch("/api/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleNumber }),
      });
      if (!res.ok) {
        throw new Error("Failed to create style");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/styles"] });
      toast({
        title: "Success",
        description: "Style number added to database",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const checkPONumberMutation = useMutation({
    mutationFn: async (poNumber: string) => {
      if (mode === 'edit') return false;
      const res = await fetch(`/api/purchase-orders/check/${encodeURIComponent(poNumber)}`);
      if (!res.ok) {
        throw new Error("Failed to check PO number. Please try again.");
      }
      const data = await res.json();
      return data.exists;
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: POFormValues) => {
      try {
        if (mode === 'create') {
          const exists = await checkPONumberMutation.mutateAsync(data.poNumber);
          if (exists) {
            throw new Error("This PO number already exists. Please use a different number.");
          }
        }

        const url = mode === 'edit'
          ? `/api/purchase-orders/${defaultValues?.id}`
          : "/api/purchase-orders";

        const method = mode === 'edit' ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Failed to save purchase order");
        }

        return res.json();
      } catch (error) {
        console.error("Error in mutation:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      onSubmit(form.getValues());
      toast({
        title: "Success",
        description: `Purchase order ${mode === 'edit' ? 'updated' : 'created'} successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save purchase order. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onFormSubmit = async (data: POFormValues) => {
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

  // Helper function to format date for input
  const formatDateForInput = (date: Date | null | undefined) => {
    if (!date) return '';
    return new Date(date).toISOString().split('T')[0];
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
                    <Input {...field} placeholder="Enter PO number" disabled={mode === 'edit'} />
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
              render={({ field: { value, onChange, ...field } }) => (
                <FormItem>
                  <FormLabel>Order Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={formatDateForInput(value)}
                      onChange={e => onChange(new Date(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startShipDate"
              render={({ field: { value, onChange, ...field } }) => (
                <FormItem>
                  <FormLabel>Start Ship Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={formatDateForInput(value)}
                      onChange={e => onChange(new Date(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cancelDate"
              render={({ field: { value, onChange, ...field } }) => (
                <FormItem>
                  <FormLabel>Cancel Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={formatDateForInput(value)}
                      onChange={e => onChange(new Date(e.target.value))}
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
                  { styleId: 0, quantity: 1, price: 0, color: "", description: "", manualStyleNumber: "" },
                ]);
              }}
            >
              Add Item
            </Button>
          </div>

          {form.watch("items").map((item, index) => (
            <div key={index} className="grid gap-4 md:grid-cols-6 items-start p-4 border rounded-lg">
              <FormField
                control={form.control}
                name={`items.${index}.manualStyleNumber`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Style Number</FormLabel>
                    <div className="flex flex-col">
                      <FormControl>
                        <Input
                          {...field}
                          list={`style-options-${index}`}
                          placeholder="Enter or select style number"
                          onChange={async (e) => {
                            const value = e.target.value;
                            field.onChange(value);

                            // Handle style selection
                            const style = styles?.find(s => s.styleNumber === value);
                            if (style) {
                              form.setValue(`items.${index}.styleId`, style.id);
                              form.setValue(`items.${index}.color`, style.color || '');
                              form.setValue(`items.${index}.description`, style.description || '');
                            } else {
                              form.setValue(`items.${index}.styleId`, 0);
                            }
                          }}
                        />
                      </FormControl>
                      <datalist id={`style-options-${index}`}>
                        {styles?.map((style) => (
                          <option key={style.id} value={style.styleNumber}>
                            {style.styleNumber}
                          </option>
                        ))}
                        {field.value && !styles?.find(s => s.styleNumber === field.value) && (
                          <option
                            value={field.value}
                            onClick={async () => {
                              try {
                                const newStyle = await addStyleMutation.mutateAsync(field.value);
                                form.setValue(`items.${index}.styleId`, newStyle.id);
                                form.setValue(`items.${index}.manualStyleNumber`, newStyle.styleNumber);
                                form.setValue(`items.${index}.color`, newStyle.color || '');
                                form.setValue(`items.${index}.description`, newStyle.description || '');
                              } catch (error) {
                                console.error("Failed to add style:", error);
                              }
                            }}
                          >
                            Add "{field.value}" to Database
                          </option>
                        )}
                      </datalist>
                    </div>
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
                        onChange={e => field.onChange(parseInt(e.target.value, 10))}
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

              <Button
                type="button"
                variant="destructive"
                className="mt-8"
                onClick={() => {
                  const items = form.getValues("items");
                  if (items.length > 1) {
                    form.setValue("items", items.filter((_, i) => i !== index));
                  }
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-6">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : mode === 'edit' ? "Update Purchase Order" : "Generate Purchase Order"}
          </Button>
        </div>
      </form>
    </Form>
  );
}