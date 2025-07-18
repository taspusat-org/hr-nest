import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('approvalheader', (table) => {
    table.increments('id').primary();
    table.string('nama', 255).nullable();
    table.text('keterangan').nullable();
    table.integer('cabang_id').nullable();

    table.foreign('cabang_id').references('id').inTable('cabang');

    table.integer('statusaktif').nullable();

    table.foreign('statusaktif').references('id').inTable('parameter');

    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('approvalheader');
}
