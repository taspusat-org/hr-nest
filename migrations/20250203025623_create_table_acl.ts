import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('acl', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('aco_id')
      .unsigned()
      .references('id')
      .inTable('acos')
      .onDelete('CASCADE');
    table
      .integer('role_id')
      .unsigned()
      .references('id')
      .inTable('role')
      .onDelete('CASCADE');
    table.string('modifiedby', 50).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('acl'); // Menghapus tabel users jika rollback
}
