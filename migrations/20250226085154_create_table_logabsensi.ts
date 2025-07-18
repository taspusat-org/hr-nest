import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('logabsensi', (table) => {
    table.increments('id').primary(); // id dengan tipe BIGINT
    table.integer('absen_id').nullable(); // absen_id dengan tipe INT
    table.timestamp('tgljam').nullable(); // tgljam dengan tipe DATETIME
    table.date('tgl').nullable(); // tgl dengan tipe DATE
    table.time('jam').nullable(); // jam dengan tipe TIME
    table.text('keterangan').nullable(); // keterangan dengan tipe NVARCHAR(MAX)
    table.text('device').nullable(); // device dengan tipe NVARCHAR(MAX)
    table.string('deviceno', 200).nullable(); // deviceno dengan tipe VARCHAR(200)
    table.text('namakaryawan').nullable(); // namakaryawan dengan tipe NVARCHAR(MAX)
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('logabsensi'); // Menghapus tabel logabsensi jika rollback
}
