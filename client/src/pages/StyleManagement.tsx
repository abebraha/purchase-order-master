import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StyleNumberForm from "@/components/StyleNumberForm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Style } from "@db/schema";

export default function StyleManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: styles } = useQuery<Style[]>({
    queryKey: ["/api/styles"],
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/styles/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to import style numbers');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/styles"] });
      toast({
        title: "Import successful",
        description: "Style numbers have been imported successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Import failed",
        description: "Failed to import style numbers. Please check your CSV file.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "text/csv") {
      importMutation.mutate(file);
    } else {
      toast({
        title: "Invalid file",
        description: "Please select a CSV file.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Style Number Management</h1>
        <Link href="/">
          <Button variant="outline">Back to PO Generator</Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add New Style</CardTitle>
          </CardHeader>
          <CardContent>
            <StyleNumberForm />
            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-medium mb-2">Import from CSV</h3>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={importMutation.isPending}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Upload a CSV file with style numbers. The file should have a "style_number" column.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Style Numbers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style #</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {styles?.map((style) => (
                  <TableRow key={style.id}>
                    <TableCell>{style.styleNumber}</TableCell>
                    <TableCell>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          // TODO: Implement delete
                        }}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}