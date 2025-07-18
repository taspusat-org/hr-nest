import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('izin', (table) => {
    table.increments('id').primary();
    table.timestamp('tglpengajuan').nullable();
    table.integer('karyawan_id').nullable();
    table.foreign('karyawan_id').references('id').inTable('karyawan');

    table.date('tglizin').nullable();
    table.integer('statusizin').nullable();
    table.foreign('statusizin').references('id').inTable('parameter');

    table.integer('statusizinbatal').nullable();
    table.foreign('statusizinbatal').references('id').inTable('parameter');

    table.text('alasanizin').nullable();
    table.integer('jenisizin_id').nullable();
    table.foreign('jenisizin_id').references('id').inTable('parameter');

    table.integer('statusapprovalatasan').nullable();
    table.timestamp('tglapprovalatasan').nullable();
    table.string('userapprovalatasan', 200).nullable();

    table.integer('statusapprovalhrd').nullable();
    table.timestamp('tglapprovalhrd').nullable();
    table.string('userapprovalhrd', 200).nullable();

    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('izin');
}
