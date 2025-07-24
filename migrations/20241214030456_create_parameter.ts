import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('parameter', (table) => {
    table.increments('id').primary();
    table.string('grp', 255).nullable();
    table.string('subgrp', 255).nullable();
    table.string('kelompok', 255).nullable();
    table.string('text', 255).nullable();
    table.text('memo').nullable();
    table.string('type', 100).nullable();
    table.string('default', 255).nullable();
    table.string('modifiedby', 50).nullable();
    table.text('info').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('parameter');
}
