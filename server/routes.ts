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
    try {
      const allStyles = await db.query.styles.findMany({
        orderBy: [desc(styles.styleNumber)],
      });
      res.json(allStyles);
    } catch (error) {
      console.error('Error fetching styles:', error);
      res.status(500).json({ error: 'Failed to fetch styles' });
    }
  });

  app.post("/api/styles", async (req, res) => {
    try {
      const { styleNumber, color = '', description = '' } = req.body;
      const newStyle = await db.insert(styles)
        .values({ 
          styleNumber, 
          color, 
          description 
        })
        .returning();
      res.json(newStyle[0]);
    } catch (error) {
      console.error('Error creating style:', error);
      res.status(500).json({ error: 'Failed to create style' });
    }
  });

  app.post("/api/styles/import", upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const records: { styleNumber: string; color: string; description: string; }[] = [];
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      parser.on('readable', function() {
        let record;
        while ((record = parser.read()) !== null) {
          // Find the style_number column (case-insensitive)
          const styleNumberKey = Object.keys(record).find(
            key => key.toLowerCase() === 'style_number'
          );

          if (styleNumberKey && record[styleNumberKey]) {
            const styleNumber = record[styleNumberKey].trim();
            if (styleNumber) {
              records.push({ 
                styleNumber,
                color: '',
                description: ''
              });
            }
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

      if (records.length === 0) {
        return res.status(400).json({ 
          error: 'No valid style numbers found in the CSV file',
          message: 'Please ensure your CSV file has a "style_number" column and contains valid style numbers.'
        });
      }

      // Insert records one by one to handle duplicates gracefully
      const results = [];
      for (const record of records) {
        try {
          const [inserted] = await db.insert(styles)
            .values(record)
            .onConflictDoNothing({ target: styles.styleNumber })
            .returning();
          if (inserted) {
            results.push(inserted);
          }
        } catch (error) {
          console.error('Error inserting style:', record, error);
        }
      }

      res.json({
        message: `Successfully imported ${results.length} style numbers`,
        imported: results
      });
    } catch (error) {
      console.error('Error importing CSV:', error);
      res.status(500).json({
        error: 'Failed to import style numbers',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
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