import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('role', (table) => {
    table.increments('id').primary();
    table.string('rolename', 50).nullable();
    table.string('modifiedby', 50).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('role'); // Menghapus tabel users jika rollback
}
