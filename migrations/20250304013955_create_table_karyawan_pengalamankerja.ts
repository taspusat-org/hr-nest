import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('karyawan_pengalamankerja', (table) => {
    table.increments('id').primary();
    table.integer('karyawan_id').nullable();
    table.foreign('karyawan_id').references('id').inTable('karyawan');

    table.string('namaperusahaan', 255).nullable();
    table.string('jabatan', 255).nullable();
    table.date('tglmulai').nullable();
    table.date('tglakhir').nullable();
    table.string('keterangan', 255).nullable();

    table.integer('statusaktif').nullable();
    table.foreign('statusaktif').references('id').inTable('parameter');

    table.string('info', 255).nullable();
    table.string('modifiedby', 200).nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('karyawan_pengalamankerja');
}
