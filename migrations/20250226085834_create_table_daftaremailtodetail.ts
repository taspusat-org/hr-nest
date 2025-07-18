import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('daftaremailtodetail', (table) => {
    table.increments('id').primary();
    table.integer('daftaremail_id').nullable();
    table.integer('toemail_id').nullable();
    table.integer('statusaktif').nullable(); // statusaktif dengan tipe INTEGER
    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();

    table.foreign('daftaremail_id').references('id').inTable('daftaremail');

    table.foreign('toemail_id').references('id').inTable('toemail');
    table.foreign('statusaktif').references('id').inTable('parameter');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .table('daftaremailtodetail', (table) => {
      table.dropForeign('daftaremail_id');
      table.dropForeign('toemail_id');
    })
    .dropTableIfExists('daftaremailtodetail');
}
