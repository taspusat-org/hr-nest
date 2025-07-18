import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('harilibur', (table) => {
    table.increments('id').primary();
    table.timestamp('tgl').nullable();
    table.text('keterangan').nullable();
    table.integer('cabang_id').nullable();
    table.integer('statusaktif').nullable();
    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();

    table.foreign('cabang_id').references('id').inTable('cabang');
    table.foreign('statusaktif').references('id').inTable('parameter');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .table('harilibur', (table) => {
      table.dropForeign('cabang_id');
    })
    .dropTableIfExists('harilibur');
}
