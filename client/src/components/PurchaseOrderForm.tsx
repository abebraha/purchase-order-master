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
      orderDate: new Date(),
      shipTo: "",
      billTo: "",
      startShipDate: new Date(),
      cancelDate: new Date(),
      items: [{ styleId: 0, quantity: 1, price: 0 }],
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
          <div key={index} className="grid gap-4 md:grid-cols-3">
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
                        label: `${style.styleNumber} - ${style.color} - ${style.description}`,
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
                { styleId: 0, quantity: 1, price: 0 },
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