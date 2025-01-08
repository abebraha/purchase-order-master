import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { styles, purchaseOrders, poItems } from "@db/schema";
import { desc, eq } from "drizzle-orm";
import multer from "multer";
import { parse } from "csv-parse";
import { Readable } from "stream";

const upload = multer({ storage: multer.memoryStorage() });

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Style Number Routes
  app.get("/api/styles", async (req, res) => {
    const allStyles = await db.query.styles.findMany({
      orderBy: [desc(styles.styleNumber)],
    });
    res.json(allStyles);
  });

  app.post("/api/styles", async (req, res) => {
    const newStyle = await db.insert(styles).values(req.body).returning();
    res.json(newStyle[0]);
  });

  app.post("/api/styles/import", upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const records: any[] = [];
      const parser = parse({
        columns: true,
        skip_empty_lines: true
      });

      parser.on('readable', function() {
        let record;
        while ((record = parser.read()) !== null) {
          if (record.style_number) {
            records.push({
              styleNumber: record.style_number.trim(),
            });
          }
        }
      });

      const parsePromise = new Promise((resolve, reject) => {
        parser.on('error', reject);
        parser.on('end', resolve);
      });

      // Convert buffer to readable stream
      const bufferStream = new Readable();
      bufferStream.push(req.file.buffer);
      bufferStream.push(null);
      bufferStream.pipe(parser);

      await parsePromise;

      // Filter out duplicates based on styleNumber
      const uniqueRecords = records.filter((record, index, self) =>
        index === self.findIndex((r) => r.styleNumber === record.styleNumber)
      );

      // Insert all unique records
      if (uniqueRecords.length > 0) {
        await db.insert(styles).values(uniqueRecords);
      }

      res.json({ message: `Imported ${uniqueRecords.length} style numbers successfully` });
    } catch (error) {
      console.error('Error importing CSV:', error);
      res.status(500).json({ error: 'Failed to import style numbers' });
    }
  });

  app.put("/api/styles/:id", async (req, res) => {
    const updated = await db
      .update(styles)
      .set(req.body)
      .where(eq(styles.id, parseInt(req.params.id)))
      .returning();
    res.json(updated[0]);
  });

  app.delete("/api/styles/:id", async (req, res) => {
    await db.delete(styles).where(eq(styles.id, parseInt(req.params.id)));
    res.json({ success: true });
  });

  // Purchase Order Routes
  app.post("/api/purchase-orders", async (req, res) => {
    try {
      const { items, ...poData } = req.body;

      // Convert string dates to Date objects
      const processedPoData = {
        ...poData,
        orderDate: new Date(poData.orderDate),
        startShipDate: new Date(poData.startShipDate),
        cancelDate: new Date(poData.cancelDate)
      };

      const newPO = await db.transaction(async (tx) => {
        const [po] = await tx.insert(purchaseOrders).values(processedPoData).returning();

        const poItemsData = items.map((item: any) => ({
          poId: po.id,
          ...item,
        }));

        await tx.insert(poItems).values(poItemsData);
        return po;
      });

      res.json(newPO);
    } catch (error) {
      console.error('Error creating purchase order:', error);
      res.status(500).json({ error: 'Failed to create purchase order' });
    }
  });

  app.get("/api/purchase-orders/:id", async (req, res) => {
    const po = await db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, parseInt(req.params.id)),
      with: {
        items: {
          with: {
            style: true,
          },
        },
      },
    });

    if (!po) {
      res.status(404).json({ message: "Purchase order not found" });
      return;
    }

    res.json(po);
  });

  return httpServer;
}