import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('log_saldo', (table) => {
    table.increments('id').primary();
    table.date('tanggal').nullable();
    table.string('jenistransaksi', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}
export async function down(knex: Knex): Promise<void> {}
