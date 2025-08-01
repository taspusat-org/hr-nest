import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('usercabang', (table) => {
    table.increments('id').primary();
    table.integer('user_id').nullable();
    table.integer('cabang_id').nullable();
    table.string('modifiedby', 50).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('usercabang'); // Menghapus tabel users jika rollback
}
