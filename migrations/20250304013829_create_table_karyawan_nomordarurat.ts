import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('karyawan_nomordarurat', (table) => {
    table.increments('id').primary();
    table.integer('karyawan_id').nullable();
    table.foreign('karyawan_id').references('id').inTable('karyawan');

    table.string('nohp', 255).nullable();
    table.string('hubungan', 255).nullable();

    table.integer('statusaktif').nullable();
    table.foreign('statusaktif').references('id').inTable('parameter');

    table.string('info', 255).nullable();
    table.string('modifiedby', 200).nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('karyawan_nomordarurat');
}
