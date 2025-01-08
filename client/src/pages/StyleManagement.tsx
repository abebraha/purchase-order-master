import { useQuery } from "@tanstack/react-query";
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
import type { Style } from "@db/schema";

export default function StyleManagement() {
  const { data: styles } = useQuery<Style[]>({
    queryKey: ["/api/styles"],
  });

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
                  <TableHead>Color</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {styles?.map((style) => (
                  <TableRow key={style.id}>
                    <TableCell>{style.styleNumber}</TableCell>
                    <TableCell>{style.color}</TableCell>
                    <TableCell>{style.description}</TableCell>
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
