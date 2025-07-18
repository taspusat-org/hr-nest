import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('shift', (table) => {
    table.increments('id').primary();
    table.string('nama', 255).nullable();
    table.string('keterangan', 255).nullable();
    table.integer('statusaktif').nullable();
    table.string('modifiedby', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('shift'); // Menghapus tabel users jika rollback
}
