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
  app.get("/api/purchase-orders", async (req, res) => {
    try {
      const allPOs = await db.query.purchaseOrders.findMany({
        orderBy: [desc(purchaseOrders.createdAt)],
        with: {
          items: {
            with: {
              style: true,
            },
          },
        },
      });
      res.json(allPOs);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
  });

  // Check if PO number exists
  app.get("/api/purchase-orders/check/:poNumber", async (req, res) => {
    try {
      console.log("Checking PO number:", req.params.poNumber);
      const existingPO = await db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.poNumber, req.params.poNumber),
      });
      console.log("Existing PO check result:", !!existingPO);
      res.json({ exists: !!existingPO });
    } catch (error) {
      console.error('Error checking PO number:', error);
      res.status(500).json({ 
        error: 'Failed to check PO number',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/purchase-orders", async (req, res) => {
    try {
      const { items, poNumber, terms, orderDate, ...poData } = req.body;

      // Check for duplicate PO number
      const existingPO = await db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.poNumber, poNumber),
      });

      if (existingPO) {
        return res.status(400).json({ 
          error: 'Duplicate PO number',
          message: 'This PO number already exists. Please use a different number.'
        });
      }

      // Convert string dates to Date objects
      const processedPoData = {
        poNumber,
        terms,
        ...poData,
        orderDate: new Date(orderDate),
        startShipDate: new Date(poData.startShipDate),
        cancelDate: new Date(poData.cancelDate)
      };

      const newPO = await db.transaction(async (tx) => {
        const [po] = await tx.insert(purchaseOrders).values(processedPoData).returning();

        // Process items, handling both existing styles and manual entries
        const poItemsData = items.map((item: any) => ({
          poId: po.id,
          styleId: item.styleId === 0 ? null : item.styleId,
          manualStyleNumber: item.manualStyleNumber,
          color: item.color,
          description: item.description,
          quantity: item.quantity,
          price: item.price
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

  app.put("/api/purchase-orders/:id", async (req, res) => {
    try {
      const { items, poNumber, terms, orderDate, startShipDate, cancelDate, shipTo, billTo, poType, specialInstructions } = req.body;
      const poId = parseInt(req.params.id);

      // Convert string dates to Date objects and prepare update data
      const processedPoData = {
        poNumber,
        terms,
        poType,
        shipTo,
        billTo,
        specialInstructions,
        orderDate: new Date(orderDate),
        startShipDate: new Date(startShipDate),
        cancelDate: new Date(cancelDate),
      };

      const updatedPO = await db.transaction(async (tx) => {
        // Update the main PO record
        const [po] = await tx
          .update(purchaseOrders)
          .set(processedPoData)
          .where(eq(purchaseOrders.id, poId))
          .returning();

        if (!po) {
          throw new Error("Purchase order not found");
        }

        // Delete existing items
        await tx
          .delete(poItems)
          .where(eq(poItems.poId, poId));

        // Insert new items
        const poItemsData = items.map((item: any) => ({
          poId: po.id,
          styleId: item.styleId === 0 ? null : item.styleId,
          manualStyleNumber: item.manualStyleNumber,
          color: item.color,
          description: item.description,
          quantity: item.quantity,
          price: item.price
        }));

        await tx.insert(poItems).values(poItemsData);
        return po;
      });

      // Fetch the updated PO with its items to return
      const updatedPOWithItems = await db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.id, poId),
        with: {
          items: {
            with: {
              style: true,
            },
          },
        },
      });

      if (!updatedPOWithItems) {
        throw new Error("Failed to fetch updated purchase order");
      }

      // Format the response to match the POFormValues type
      const formattedPO = {
        ...updatedPOWithItems,
        items: updatedPOWithItems.items.map(item => ({
          styleId: item.styleId || 0,
          manualStyleNumber: item.manualStyleNumber || '',
          color: item.color || '',
          description: item.description || '',
          quantity: item.quantity,
          price: item.price,
        }))
      };

      res.json(formattedPO);
    } catch (error) {
      console.error('Error updating purchase order:', error);
      res.status(500).json({ 
        error: 'Failed to update purchase order',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/purchase-orders/:id", async (req, res) => {
    try {
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
        return res.status(404).json({ message: "Purchase order not found" });
      }

      // Format the response to match the POFormValues type
      const formattedPO = {
        ...po,
        items: po.items.map(item => ({
          styleId: item.styleId || 0,
          manualStyleNumber: item.manualStyleNumber || '',
          color: item.color || '',
          description: item.description || '',
          quantity: item.quantity,
          price: item.price,
        }))
      };

      res.json(formattedPO);
    } catch (error) {
      console.error('Error fetching purchase order:', error);
      res.status(500).json({ 
        message: "Failed to fetch purchase order",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete("/api/purchase-orders/:id", async (req, res) => {
    try {
      await db.transaction(async (tx) => {
        // Delete PO items first
        await tx.delete(poItems)
          .where(eq(poItems.poId, parseInt(req.params.id)));

        // Then delete the PO
        await tx.delete(purchaseOrders)
          .where(eq(purchaseOrders.id, parseInt(req.params.id)));
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      res.status(500).json({ 
        error: 'Failed to delete purchase order',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return httpServer;
}