import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('izinapproval', (table) => {
    table.increments('id').primary();
    table.integer('izin_id').nullable();
    table.integer('karyawan_id').nullable();
    table.integer('jenjangapproval').nullable();
    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
    table.integer('statusapproval').nullable();
    table.timestamp('tglapproval').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('izinapproval');
}
