import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PurchaseOrderForm from "@/components/PurchaseOrderForm";
import POPreview from "@/components/POPreview";
import { POFormValues } from "@/lib/types";

export default function Home() {
  const [currentPO, setCurrentPO] = useState<POFormValues | null>(null);

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Purchase Order Generator</h1>
        <div className="flex gap-4">
          <Link href="/purchase-orders">
            <Button variant="secondary">View PO History</Button>
          </Link>
          <Link href="/styles">
            <Button variant="outline">Manage Style Numbers</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Purchase Order</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="form">
            <TabsList>
              <TabsTrigger value="form">PO Form</TabsTrigger>
              <TabsTrigger value="preview" disabled={!currentPO}>
                Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent value="form">
              <PurchaseOrderForm onSubmit={setCurrentPO} />
            </TabsContent>
            <TabsContent value="preview">
              {currentPO && <POPreview data={currentPO} />}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}