import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('shift_detail', (table) => {
    table.increments('id').primary();
    table.integer('shift_id').nullable();
    table.integer('date_id').nullable();
    table.string('batas_jammasuk', 255).nullable();
    table.string('jammasuk', 255).nullable();
    table.string('jampulang', 255).nullable();
    table.integer('statusaktif').nullable();
    table.string('modifiedby', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('shift_detail'); // Menghapus tabel users jika rollback
}
