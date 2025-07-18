import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('mutasi', (table) => {
    table.increments('id').primary();
    table.date('tglmutasi').nullable();
    table.integer('karyawan_id').nullable();
    table.foreign('karyawan_id').references('id').inTable('karyawan');

    table.integer('cabanglama_id').nullable();
    table.foreign('cabanglama_id').references('id').inTable('cabang');

    table.integer('cabangbaru_id').nullable();
    table.foreign('cabangbaru_id').references('id').inTable('cabang');

    table.integer('jabatanlama_id').nullable();
    table.foreign('jabatanlama_id').references('id').inTable('jabatan');

    table.integer('jabatanbaru_id').nullable();
    table.foreign('jabatanbaru_id').references('id').inTable('jabatan');

    table.text('keterangan').nullable();
    table.integer('statusaktif').nullable();
    table.foreign('statusaktif').references('id').inTable('parameter');

    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('mutasi');
}
