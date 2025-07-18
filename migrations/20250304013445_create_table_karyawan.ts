import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('karyawan', (table) => {
    table.increments('id').primary();
    table.integer('agama_id').nullable();
    table.foreign('agama_id').references('id').inTable('parameter');

    table.integer('statuskerja_id').nullable();
    table.foreign('statuskerja_id').references('id').inTable('parameter');
    table.string('npwp', 30).nullable();
    table.integer('statuskaryawan_id').nullable();
    table.foreign('statuskaryawan_id').references('id').inTable('parameter');

    table.integer('jumlahtanggungan').nullable();
    table.string('noktp', 16).nullable();

    table.text('namakaryawan').nullable();
    table.text('namaalias').nullable();

    table.integer('jeniskelamin_rid').nullable();
    table.foreign('jeniskelamin_rid').references('id').inTable('parameter');

    table.text('alamat').nullable();
    table.text('tempatlahir').nullable();
    table.date('tgllahir').nullable();

    table.integer('golongandarah_id').nullable();
    table.foreign('golongandarah_id').references('id').inTable('parameter');

    table.text('nohp').nullable();
    table.text('foto').nullable();
    table.date('tglmasukkerja').nullable();

    table.integer('cabang_id').nullable();
    table.foreign('cabang_id').references('id').inTable('cabang');

    table.integer('jabatan_id').nullable();
    table.foreign('jabatan_id').references('id').inTable('jabatan');

    table.text('keterangan').nullable();
    table.text('namaibu').nullable();
    table.text('namaayah').nullable();
    table.text('pengalamankerja').nullable();

    table.string('kodekaryawan', 200).nullable();
    table.string('email', 255).nullable();
    table.date('tglresign').nullable();
    table.date('tglmutasi').nullable();

    table.integer('atasan_id').nullable();
    table.foreign('atasan_id').references('id').inTable('karyawan');

    table.integer('thr_id').nullable();
    table.foreign('thr_id').references('id').inTable('parameter');

    table.integer('daftaremail_id').nullable();
    table.foreign('daftaremail_id').references('id').inTable('daftaremail');

    table.string('kodemarketing', 100).nullable();
    table.text('alasanberhenti').nullable();

    table.integer('absen_id').nullable();
    table.foreign('absen_id').references('id').inTable('logabsensi');

    table.text('spesifikasikomputer').nullable();
    table.integer('approval_id').nullable();
    table.integer('statusaktif').nullable();
    table.foreign('statusaktif').references('id').inTable('parameter');

    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('karyawan');
}
