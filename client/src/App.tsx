import { Switch, Route } from "wouter";
import Home from "./pages/Home";
import StyleManagement from "./pages/StyleManagement";
import PurchaseOrders from "./pages/PurchaseOrders";
import PurchaseOrderView from "./pages/PurchaseOrderView";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/styles" component={StyleManagement} />
        <Route path="/purchase-orders" component={PurchaseOrders} />
        <Route path="/purchase-orders/:id" component={PurchaseOrderView} />
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;