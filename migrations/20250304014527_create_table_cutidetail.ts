import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('cutidetail', (table) => {
    table.increments('id').primary();
    table.integer('cuti_id').nullable();
    table.foreign('cuti_id').references('id').inTable('cuti');

    table.date('tglcuti').nullable();
    table.date('periodecutidari').nullable();
    table.date('periodecutisampai').nullable();

    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('cutidetail');
}
