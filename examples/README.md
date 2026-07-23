# Query Quilt examples

The records in this directory are synthetic and were created for Query Quilt. Names,
orders, suppliers, dates, prices, and inventory levels do not describe real people or
businesses.

The example data and workflows are distributed under the repository's
[MIT License](../LICENSE). They may be copied, modified, and used offline.

## Tables

- `data/sales.csv`: 30 synthetic orders across four regions and ten products.
- `data/inventory.csv`: stock and reorder levels for the same product catalog.
- `data/customers.csv`: ten synthetic customer profiles.

## Workflows

The five JSON documents demonstrate filters, projections, derived columns, grouping,
joins, and sorting. Each document is validated by the same Zod schema used by the
application.
