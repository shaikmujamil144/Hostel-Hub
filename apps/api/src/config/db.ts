import mongoose from 'mongoose';

const ensurePaymentOptionalUniqueIndexes = async () => {
  const db = mongoose.connection.db;
  if (!db) return;

  const collection = db.collection('payments');

  const replaceIndex = async (
    indexName: string,
    key: Record<string, 1 | -1>,
    filterField: 'invoiceNumber' | 'idempotencyKey' | 'razorpayPaymentId'
  ) => {
    const indexes = await collection.indexes();
    const currentIndex = indexes.find((index) => index.name === indexName);

    if (!currentIndex) {
      await collection.createIndex(key, {
        name: indexName,
        unique: true,
        partialFilterExpression: {
          [filterField]: { $exists: true, $type: 'string' },
        },
      });
      console.log(`Created missing payments index ${indexName} with partial filter`);
      return;
    }

    const alreadyPartial = Boolean(currentIndex?.partialFilterExpression?.[filterField]);
    if (alreadyPartial) {
      return;
    }

    await collection.dropIndex(indexName);
    await collection.createIndex(key, {
      name: indexName,
      unique: true,
      partialFilterExpression: {
        [filterField]: { $exists: true, $type: 'string' },
      },
    });
    console.log(`Rebuilt payments index ${indexName} with partial filter`);
  };

  await replaceIndex('hostelId_1_invoiceNumber_1', { hostelId: 1, invoiceNumber: 1 }, 'invoiceNumber');
  await replaceIndex('hostelId_1_idempotencyKey_1', { hostelId: 1, idempotencyKey: 1 }, 'idempotencyKey');
  await replaceIndex(
    'hostelId_1_razorpayPaymentId_1',
    { hostelId: 1, razorpayPaymentId: 1 },
    'razorpayPaymentId'
  );
};

export const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
    
    if (!mongoURI) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }

    const conn = await mongoose.connect(mongoURI);

    await ensurePaymentOptionalUniqueIndexes();

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`MongoDB connection failed: ${error.message}`);

    // Keep local dev server running for UI/API smoke testing even without MongoDB.
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};
