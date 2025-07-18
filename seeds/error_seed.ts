import type { Knex } from 'knex';

// Define a type for the error table row
interface ErrorTableRow {
  kode: string | null;
  ket: string | null;
  statusaktif: number | null;
  modifiedby: string | null;
  created_at: Knex.Raw<any>;
  updated_at: Knex.Raw<any>;
}

export async function seed(knex: Knex): Promise<void> {
  // Clean up the existing data (optional)

  const data: ErrorTableRow[] = [];
  const batchSize = 500; // Adjust batch size to avoid hitting parameter limits

  // Generate 500k records
  for (let i = 0; i < 1000; i++) {
    data.push({
      kode: `CODE${i + 1}`,
      ket: `Description for error ${i + 1}`,
      modifiedby: `user${Math.floor(Math.random() * 100)}`,
      statusaktif: 1,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    // Insert data in batches to avoid exceeding the parameter limit
    if (data.length === batchSize) {
      await knex('error').insert(data);
      data.length = 0; // Clear the array after insertion
    }
  }

  // Insert any remaining records
  if (data.length > 0) {
    await knex('error').insert(data);
  }
}
