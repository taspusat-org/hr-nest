import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('acos', (table) => {
    table.increments('id').primary();
    table.string('class', 50).nullable();
    table.string('method', 50).nullable();
    table.string('nama', 150).nullable();
    table.string('modifiedby', 50).nullable();
    table.integer('idheader').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('acos'); // Menghapus tabel users jika rollback
}
