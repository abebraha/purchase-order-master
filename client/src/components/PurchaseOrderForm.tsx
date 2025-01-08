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
      poType: "Regular PO",
      orderDate: new Date(),
      shipTo: "",
      billTo: "",
      startShipDate: new Date(),
      cancelDate: new Date(),
      items: [{ styleId: 0, quantity: 1, price: 0, color: "", description: "" }],
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: POFormValues) => {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error("Failed to create purchase order");
      }

      return res.json();
    },
    onSuccess: (data) => {
      onSubmit(form.getValues());
      toast({
        title: "Success",
        description: "Purchase order created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create purchase order. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
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
                    <FormLabel className="font-normal">
                      Regular PO
                    </FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <RadioGroupItem value="Bulk" />
                    </FormControl>
                    <FormLabel className="font-normal">
                      Bulk
                    </FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 md:grid-cols-2">
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
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="orderDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value?.toISOString().split('T')[0]} onChange={e => field.onChange(new Date(e.target.value))} />
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
                  <Input type="date" {...field} value={field.value?.toISOString().split('T')[0]} onChange={e => field.onChange(new Date(e.target.value))} />
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
                  <Input type="date" {...field} value={field.value?.toISOString().split('T')[0]} onChange={e => field.onChange(new Date(e.target.value))} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {form.watch("items").map((_, index) => (
          <div key={index} className="grid gap-4 md:grid-cols-5">
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
                      onSelect={(value) => field.onChange(parseInt(value))}
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
                    <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
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
                    <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ))}

        <div className="flex gap-2">
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
          <Button type="submit" disabled={mutation.isPending}>
            Generate Purchase Order
          </Button>
        </div>
      </form>
    </Form>
  );
}