import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('username', 255).nullable();
    table.string('name', 255).nullable();
    table.string('password', 255).nullable();
    table.string('email', 255).nullable();
    table.text('menu').nullable(); // nvarchar(max) equivalent
    table.integer('statusaktif').nullable();
    table.string('modifiedby', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('users'); // Menghapus tabel users jika rollback
}
