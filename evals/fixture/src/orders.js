// PLANTED DEFECT: idor
// Reads an order by id with no ownership or tenant check. Any authenticated
// user can read any order by guessing or enumerating the id.
export async function getOrder(db, req) {
  const order = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id])
  return order.rows[0]
}

// PLANTED DEFECT: unbounded-query
// orders grows without bound and this has no LIMIT, no pagination and no
// index hint. It is fine on a seeded dev database and fails in production.
export async function listAllOrders(db) {
  const all = await db.query('SELECT * FROM orders ORDER BY created_at DESC')
  return all.rows
}
