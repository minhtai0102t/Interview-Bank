# Database interview questions

Notes before the first question are not part of any question.

## What is an index?

An index is a data structure that speeds up reads at the cost of slower writes.

## What is the difference between `WHERE` and `HAVING`?

`WHERE` filters rows before grouping; `HAVING` filters groups after aggregation.

```sql
-- ## a heading-like line inside a code block is not a question
SELECT department, COUNT(*)
FROM employees
GROUP BY department
HAVING COUNT(*) > 5;
```

## What does ACID stand for?

| Letter | Meaning     |
| ------ | ----------- |
| A      | Atomicity   |
| C      | Consistency |
| I      | Isolation   |
| D      | Durability  |
