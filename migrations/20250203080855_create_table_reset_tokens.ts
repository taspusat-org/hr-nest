import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reset_tokens', (table) => {
    table.increments('id').primary();
    table.string('email', 50).nullable();
    table.string('token', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('reset_tokens'); // Menghapus tabel users jika rollback
}
