import { lazy, Suspense } from "react";
import { Link, Route, Switch } from "wouter";
import { FileQuestion } from "lucide-react";
import { AuthGate } from "@/components/auth/AuthGate";
import { AppShell, PageContainer, PageHeader } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const PurchaseOrderView = lazy(() => import("./pages/PurchaseOrderView"));
const PurchaseOrderEditor = lazy(() => import("./pages/PurchaseOrderEditor"));
const StyleManagement = lazy(() => import("./pages/StyleManagement"));
const Settings = lazy(() => import("./pages/Settings"));

function PageFallback() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 pt-[68px] md:px-6 lg:px-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 pt-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function NotFound() {
  return (
    <>
      <PageHeader title="Page Not Found" backHref="/" backLabel="Home" />
      <PageContainer>
        <EmptyState
          icon={FileQuestion}
          title="We couldn't find that page"
          description="The link may be out of date."
          action={
            <Button asChild>
              <Link href="/">Go to dashboard</Link>
            </Button>
          }
        />
      </PageContainer>
    </>
  );
}

function App() {
  return (
    <AuthGate>
      <AppShell>
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/purchase-orders" component={PurchaseOrders} />
            <Route path="/purchase-orders/new" component={PurchaseOrderEditor} />
            <Route path="/purchase-orders/:id/edit" component={PurchaseOrderEditor} />
            <Route path="/purchase-orders/:id" component={PurchaseOrderView} />
            <Route path="/styles" component={StyleManagement} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </AppShell>
    </AuthGate>
  );
}

export default App;
