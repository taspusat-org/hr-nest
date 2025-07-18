import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('approvaldetail', (table) => {
    table.increments('id').primary();
    table.integer('approval_id').nullable();
    table.integer('karyawan_id').nullable();
    table.integer('jenjangapproval').nullable();
    table.text('info').nullable();
    table.string('modifiedby', 200).nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();

    // Define foreign key constraints after defining the columns
    table.foreign('approval_id').references('id').inTable('approvalheader');
    table.foreign('karyawan_id').references('id').inTable('karyawan');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('approvaldetail');
}
