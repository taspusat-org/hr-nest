import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('cuti', (table) => {
    table.increments('id').primary();
    table.date('tglpengajuan').nullable();
    table.integer('karyawan_id').nullable();
    table.foreign('karyawan_id').references('id').inTable('karyawan');

    table.text('tglcuti').nullable();
    table.integer('statuscuti').nullable();
    table.foreign('statuscuti').references('id').inTable('parameter');

    table.integer('statuscutibatal').nullable();
    table.foreign('statuscutibatal').references('id').inTable('parameter');

    table.text('nohp').nullable();
    table.text('alasanpenolakan').nullable();
    table.text('alasancuti').nullable();
    table.integer('jumlahcuti').nullable();

    table.integer('kategoricuti_id').nullable();
    table.foreign('kategoricuti_id').references('id').inTable('parameter');

    table.integer('statusnonhitung').nullable();
    table.foreign('statusnonhitung').references('id').inTable('parameter');

    table.text('lampiran').nullable();

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
  return knex.schema.dropTableIfExists('cuti');
}
