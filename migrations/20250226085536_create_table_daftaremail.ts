import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('daftaremail', (table) => {
    table.increments('id').primary();
    table.text('nama').nullable();
    table.text('keterangan').nullable();
    table.integer('statusaktif').nullable();
    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();
    table.foreign('statusaktif').references('id').inTable('parameter');

    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('daftaremail');
}
