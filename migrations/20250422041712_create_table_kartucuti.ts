import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('kartucuti', (table) => {
    table.increments('id').primary();
    table.integer('karyawan_id').nullable();
    table.integer('cabang_id').nullable();
    table.date('periodetgldari').nullable();
    table.date('periodetglsampai').nullable();
    table.date('tgltransaksi').nullable();
    table.string('jenistransaksi', 255).nullable();
    table.integer('masuk').nullable();
    table.integer('keluar').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('kartucuti'); // Menghapus tabel users jika rollback
}
